import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SequenceStatus } from '@onspace/db';

export class SequenceStepDto {
  @IsInt()
  @Min(0)
  @Max(365)
  delayDays!: number;

  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsBoolean()
  stopOnReply?: boolean;

  @IsOptional()
  @IsBoolean()
  stopOnStageProgression?: boolean;
}

export class CreateSequenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  dailySendLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  sendIntervalSec?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SequenceStepDto)
  steps!: SequenceStepDto[];
}

export class UpdateSequenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  dailySendLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  sendIntervalSec?: number;

  @IsOptional()
  @IsEnum(SequenceStatus)
  status?: SequenceStatus;
}

export class EnrollLeadsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  leadIds!: string[];
}
