import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsUUID() groupId!: string;
  @IsUUID() templateId!: string;
  @IsUUID() accountId!: string;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  dailySendLimit?: number;

  @IsOptional() @IsInt() @Min(1) @Max(3600)
  sendIntervalSec?: number;
}
