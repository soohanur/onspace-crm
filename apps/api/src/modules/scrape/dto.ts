import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateScrapeJobDto {
  @IsString()
  searchQuery!: string;

  @IsString()
  searchLocation!: string;
}

export class CreateScrapeJobBatchDto {
  /** Categories/queries — each one paired with every location to form a job. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  searchQueries!: string[];

  /** Locations — each one paired with every category. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  searchLocations!: string[];
}
