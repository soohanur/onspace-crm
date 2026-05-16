import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug must be lowercase letters/digits/dash, starting with alphanumeric' })
  slug!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(2)
  ownerName!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  ownerPassword?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  seatLimit?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  /** Product keys to enable at creation. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  productKeys?: string[];
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  seatLimit?: number;

  @IsOptional()
  @IsEnum(['active', 'suspended', 'expired'])
  status?: 'active' | 'suspended' | 'expired';

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class ToggleProductDto {
  @IsString()
  productKey!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class ToggleFeatureDto {
  @IsString()
  featureKey!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpsertSubscriptionDto {
  @IsString()
  @MinLength(2)
  planName!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  expiresAt!: string;

  @IsOptional()
  @IsEnum(['active', 'expired', 'suspended'])
  status?: 'active' | 'expired' | 'suspended';

  @IsOptional()
  @IsNumber()
  amountPaid?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
