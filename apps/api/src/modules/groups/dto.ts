import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum GroupTypeDto {
  manual = 'manual',
  smart = 'smart',
}

export class CreateGroupDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(GroupTypeDto)
  type!: GroupTypeDto;

  /** Same shape as the GET /api/leads query params. Required when type === 'smart'. */
  @IsOptional()
  filterDsl?: Record<string, unknown>;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  filterDsl?: Record<string, unknown>;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class GroupLeadIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  leadIds!: string[];
}
