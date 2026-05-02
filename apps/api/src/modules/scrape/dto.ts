import { IsString } from 'class-validator';

export class CreateScrapeJobDto {
  @IsString()
  searchQuery!: string;

  @IsString()
  searchLocation!: string;
}
