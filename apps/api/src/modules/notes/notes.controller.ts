import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { NotesService } from './notes.service';

class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

/** Notes are scoped to a lead — routed under /leads/:leadId/notes. */
@Controller('leads/:leadId/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@Param('leadId') leadId: string) {
    return this.notes.list(leadId);
  }

  @Post()
  create(@Param('leadId') leadId: string, @Body() dto: CreateNoteDto) {
    return this.notes.create(leadId, dto.body);
  }

  @Delete(':noteId')
  remove(@Param('leadId') leadId: string, @Param('noteId') noteId: string) {
    return this.notes.remove(leadId, noteId);
  }
}
