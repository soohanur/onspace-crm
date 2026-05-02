import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { EmailService } from './email.service';
import { readAttachment } from './attachments';

// 1×1 transparent GIF — served by the tracking pixel endpoint.
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller()
export class EmailController {
  constructor(private readonly emails: EmailService) {}

  /**
   * Send an email. Accepts multipart/form-data so files can be attached.
   * Plain JSON also works (no files).
   */
  @Post('email/send')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  send(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const cc = parseList(body.cc);
    const bcc = parseList(body.bcc);
    return this.emails.send({
      leadId: body.leadId,
      accountId: body.accountId || undefined,
      toEmail: body.toEmail,
      cc,
      bcc,
      subject: body.subject,
      body: body.body,
      bodyHtml: body.bodyHtml || undefined,
      replyToLogId: body.replyToLogId || undefined,
      attachments: files.map((f) => ({
        filename: f.originalname,
        mimeType: f.mimetype || 'application/octet-stream',
        buffer: f.buffer,
        size: f.size,
      })),
    });
  }

  /** Per-lead history (replies inlined). */
  @Get('leads/:leadId/emails')
  history(@Param('leadId') leadId: string, @Query('take') take?: string) {
    return this.emails.listForLead(leadId, take ? Number(take) : undefined);
  }

  /** Full detail of one email log. */
  @Get('email/logs/:id')
  one(@Param('id') id: string) {
    return this.emails.findOne(id);
  }

  /** Manually trigger reply fetch for one email. */
  @Post('email/logs/:id/refresh-replies')
  @HttpCode(HttpStatus.OK)
  refreshReplies(@Param('id') id: string) {
    return this.emails.refreshReplies(id);
  }

  /** Manually trigger reply fetch for all recent emails. */
  @Post('email/refresh-replies')
  @HttpCode(HttpStatus.OK)
  refreshAll() {
    return this.emails.refreshAllRecent(7);
  }

  /** Open-tracking pixel. Logs every hit; defends against Gmail prefetch. */
  @Get('email/track/:trackingId.gif')
  async track(
    @Param('trackingId') trackingId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const fwd = (req.headers['x-forwarded-for'] as string) ?? '';
      const ip = fwd.split(',')[0].trim() || req.socket?.remoteAddress || null;
      await this.emails.recordOpen(trackingId, {
        userAgent: req.headers['user-agent'] as string | undefined,
        ipAddress: ip ?? undefined,
      });
    } catch {
      /* never let recording failure block serving the pixel */
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(PIXEL_GIF);
  }

  /** Inspect all pixel hits for an email — debugging/forensic endpoint. */
  @Get('email/logs/:id/hits')
  async hits(@Param('id') id: string) {
    return this.emails.listHits(id);
  }

  /** Download a stored attachment. */
  @Get('email/logs/:id/attachments/:filename')
  async download(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const log = await this.emails.findOne(id);
    const att = (log.attachments as any[]).find((a) => a.filename === filename);
    if (!att) throw new NotFoundException('Attachment not found');
    const data = await readAttachment(id, filename);
    if (!data) throw new NotFoundException('Attachment file missing');
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.setHeader('Content-Length', data.size.toString());
    res.send(data.buffer);
  }
}

function parseList(v: unknown): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}
