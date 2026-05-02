import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProposalsService } from './proposals.service';
import { SendProposalDto } from './dto';

@Controller()
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get('leads/:leadId/proposals')
  listForLead(@Param('leadId') leadId: string) {
    return this.proposals.listForLead(leadId);
  }

  @Get('proposals/:id')
  findOne(@Param('id') id: string) {
    return this.proposals.findOne(id);
  }

  @Delete('proposals/:id')
  remove(@Param('id') id: string) {
    return this.proposals.remove(id);
  }

  /**
   * Multipart `POST /api/proposals/send`. Validation mirrors the email
   * send endpoint: 1–10 files, each ≤ 10 MB, total ≤ 25 MB (Gmail's
   * hard cap). DTO fields come in on the body; files on the FilesInterceptor.
   */
  @Post('proposals/send')
  @UseInterceptors(
    FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async send(
    @Body() body: SendProposalDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    if (files.length === 0) {
      throw new BadRequestException('At least one attachment is required');
    }
    const totalBytes = files.reduce((s, f) => s + (f.size ?? 0), 0);
    if (totalBytes > 25 * 1024 * 1024) {
      throw new BadRequestException('Total attachment size exceeds 25 MB');
    }
    return this.proposals.send({
      leadId: body.leadId,
      contactId: body.contactId || null,
      accountId: body.accountId || null,
      subject: body.subject,
      message: body.message,
      files: files.map((f) => ({
        filename: f.originalname,
        mimeType: f.mimetype || 'application/octet-stream',
        buffer: f.buffer,
        size: f.size,
      })),
    });
  }
}
