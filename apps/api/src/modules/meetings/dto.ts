import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MeetingStatus, MeetingType } from '@onspace/db';

export class CreateMeetingDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsString() @MinLength(1) @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingLink?: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number;

  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nextAction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedTo?: string;
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @IsOptional() @IsString() @MaxLength(500)
  meetingLink?: string | null;

  @IsOptional() @IsISO8601()
  scheduledAt?: string;

  @IsOptional() @IsInt() @Min(5) @Max(480)
  durationMin?: number;

  @IsOptional() @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @IsOptional() @IsString() @MaxLength(5000)
  notes?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  nextAction?: string | null;

  @IsOptional() @IsUUID()
  contactId?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  assignedTo?: string | null;
}
