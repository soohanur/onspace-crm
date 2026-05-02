import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CallDirection, CallOutcome, CallStatus } from '@onspace/db';

/**
 * Phase 12 — manual call log. `status` defaults server-side to
 * `completed` (most logs are after-the-fact). `outcome` is required when
 * `status='completed'`; we don't validate that here so PATCHes can
 * preserve the existing outcome on partial updates — the service layer
 * surfaces a clear 400 if a complete-with-no-outcome is attempted.
 */
export class CreateCallDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsEnum(CallDirection)
  direction!: CallDirection;

  @IsOptional() @IsString() @MaxLength(64)
  toPhone?: string;

  @IsOptional() @IsString() @MaxLength(64)
  fromPhone?: string;

  @IsISO8601()
  occurredAt!: string;

  @IsOptional() @IsInt() @Min(0) @Max(86_400)
  durationSec?: number;

  @IsOptional() @IsEnum(CallOutcome)
  outcome?: CallOutcome;

  @IsOptional() @IsEnum(CallStatus)
  status?: CallStatus;

  @IsOptional() @IsString() @MaxLength(5000)
  notes?: string;

  @IsOptional() @IsBoolean()
  voicemailLeft?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  nextAction?: string;

  @IsOptional() @IsString() @MaxLength(200)
  assignedTo?: string;
}

export class UpdateCallDto {
  @IsOptional() @IsUUID()
  contactId?: string | null;

  @IsOptional() @IsEnum(CallDirection)
  direction?: CallDirection;

  @IsOptional() @IsString() @MaxLength(64)
  toPhone?: string | null;

  @IsOptional() @IsString() @MaxLength(64)
  fromPhone?: string | null;

  @IsOptional() @IsISO8601()
  occurredAt?: string;

  @IsOptional() @IsInt() @Min(0) @Max(86_400)
  durationSec?: number | null;

  @IsOptional() @IsEnum(CallOutcome)
  outcome?: CallOutcome | null;

  @IsOptional() @IsEnum(CallStatus)
  status?: CallStatus;

  @IsOptional() @IsString() @MaxLength(5000)
  notes?: string | null;

  @IsOptional() @IsBoolean()
  voicemailLeft?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  nextAction?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  assignedTo?: string | null;
}
