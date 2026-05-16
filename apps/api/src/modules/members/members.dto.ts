import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  /** Role key inside the workspace (owner | admin | manager | sales | viewer | custom). */
  @IsString()
  @IsNotEmpty()
  roleKey!: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  roleKey?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
