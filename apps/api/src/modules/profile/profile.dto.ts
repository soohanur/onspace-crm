import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** Data URI (data:image/...) or http(s) URL. Capped to 350 KB to stay row-friendly. */
  @IsOptional()
  @IsString()
  @MaxLength(360_000)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  jobTitle?: string | null;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
