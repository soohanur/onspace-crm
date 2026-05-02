import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendEmailDto {
  @IsUUID('4')
  leadId!: string;

  /** Optional — defaults to the only active account. Required when multiple connected. */
  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsEmail()
  toEmail!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(998) // RFC 5322 line length on Subject is fine up to ~998
  subject!: string;

  /** Plain-text body (we'll wrap it in a minimal HTML if no html provided). */
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body!: string;

  /** Optional rich HTML — if provided, used directly. */
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  bodyHtml?: string;
}
