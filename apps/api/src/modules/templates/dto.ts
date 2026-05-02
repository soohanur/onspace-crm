import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject!: string;

  @IsString()
  @MinLength(1)
  bodyText!: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(500)
  subject?: string;

  @IsOptional() @IsString() @MinLength(1)
  bodyText?: string;

  @IsOptional() @IsString()
  bodyHtml?: string;
}
