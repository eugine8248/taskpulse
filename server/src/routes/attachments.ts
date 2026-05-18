import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { broadcast } from '../services/wsHub';
import { fireCardEvent } from '../services/cardEvents';

export const attachmentsRouter = Router();
attachmentsRouter.use(authMiddleware);

const ATTACHMENT_ROOT = path.resolve(process.cwd(), 'data', 'attachments');
if (!fs.existsSync(ATTACHMENT_ROOT)) {
  fs.mkdirSync(ATTACHMENT_ROOT, { recursive: true });
}

const FILE_CAP_BYTES = 25 * 1024 * 1024; // 25 MB / file
const CARD_TOTAL_CAP_BYTES = 100 * 1024 * 1024; // 100 MB / card

// Lazy disk storage — we want the cardId-bound folder created on demand.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const cardId = parseInt((req.params as { id: string }).id, 10);
      const dir = path.join(ATTACHMENT_ROOT, String(cardId));
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        return cb(err as Error, dir);
      }
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: FILE_CAP_BYTES },
});

async function userOwnsCard(userId: number, cardId: number): Promise<boolean> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { column: { include: { board: true } } },
  });
  return !!card && card.column.board.userId === userId;
}

function shapeAttachment(a: {
  id: number;
  cardId: number;
  fileUrl: string;
  fileKey: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  authorUserId: number;
  uploadedAt: Date;
}) {
  return {
    id: a.id,
    cardId: a.cardId,
    fileUrl: a.fileUrl,
    fileKey: a.fileKey,
    mimeType: a.mimeType,
    byteSize: a.byteSize,
    originalName: a.originalName,
    authorUserId: a.authorUserId,
    uploadedAt: a.uploadedAt.toISOString(),
  };
}

// POST /api/attachments/cards/:id — upload one or many files
attachmentsRouter.post(
  '/cards/:id',
  upload.array('files', 10),
  async (req: AuthedRequest, res) => {
    try {
      const cardId = parseInt(req.params.id, 10);
      if (!Number.isFinite(cardId)) {
        return res.status(400).json({ success: false, error: 'Invalid card id' });
      }
      if (!(await userOwnsCard(req.userId!, cardId))) {
        // Clean up uploaded files
        for (const f of (req.files as Express.Multer.File[]) || []) {
          try { fs.unlinkSync(f.path); } catch {}
        }
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      const incoming = (req.files as Express.Multer.File[]) || [];
      const existingSize = await prisma.cardAttachment.aggregate({
        where: { cardId },
        _sum: { byteSize: true },
      });
      const incomingTotal = incoming.reduce((s, f) => s + f.size, 0);
      if ((existingSize._sum.byteSize || 0) + incomingTotal > CARD_TOTAL_CAP_BYTES) {
        for (const f of incoming) {
          try { fs.unlinkSync(f.path); } catch {}
        }
        return res
          .status(413)
          .json({ success: false, error: 'attachments_cap_reached', capBytes: CARD_TOTAL_CAP_BYTES });
      }

      const created = [];
      for (const f of incoming) {
        const fileKey = `${cardId}/${path.basename(f.path)}`;
        const fileUrl = `/static/attachments/${fileKey}`;
        const row = await prisma.cardAttachment.create({
          data: {
            cardId,
            fileUrl,
            fileKey,
            mimeType: f.mimetype || 'application/octet-stream',
            byteSize: f.size,
            originalName: f.originalname,
            authorUserId: req.userId!,
          },
        });
        created.push(shapeAttachment(row));
        fireCardEvent({
          cardId,
          kind: 'attached',
          actorUserId: req.userId!,
          meta: { originalName: f.originalname, byteSize: f.size, mimeType: f.mimetype },
        });
      }
      broadcast(req.userId!, { type: 'card.attachments.add', cardId, attachments: created });
      res.json({ success: true, data: created });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[attachments/upload] error:', err);
      res.status(500).json({ success: false, error: 'Upload failed' });
    }
  },
);

// GET /api/attachments/cards/:id
attachmentsRouter.get('/cards/:id', async (req: AuthedRequest, res) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ success: false, error: 'Invalid card id' });
    }
    if (!(await userOwnsCard(req.userId!, cardId))) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    const rows = await prisma.cardAttachment.findMany({
      where: { cardId },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({ success: true, data: rows.map(shapeAttachment) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[attachments/list] error:', err);
    res.status(500).json({ success: false, error: 'List failed' });
  }
});

// DELETE /api/attachments/:id — author only
attachmentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: 'Invalid attachment id' });
    }
    const row = await prisma.cardAttachment.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ success: false, error: 'Attachment not found' });
    if (row.authorUserId !== req.userId!) {
      return res.status(403).json({ success: false, error: 'Not author' });
    }
    // remove file on disk
    const filePath = path.join(ATTACHMENT_ROOT, row.fileKey);
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* idempotent */
    }
    await prisma.cardAttachment.delete({ where: { id } });
    broadcast(req.userId!, { type: 'card.attachments.delete', cardId: row.cardId, id });
    res.json({ success: true, data: { id } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[attachments/delete] error:', err);
    res.status(500).json({ success: false, error: 'Delete failed' });
  }
});
