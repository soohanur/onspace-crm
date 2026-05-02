import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Phase 11 — outbound proposal. Multipart payload coming in via
 * `POST /api/proposals/send`. Files arrive on `Express.Multer.File[]`
 * separately so they don't show here.
 */
export class SendProposalDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(998)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  message!: string;
}
