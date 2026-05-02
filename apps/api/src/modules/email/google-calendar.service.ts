import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

const SERVER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export interface CalendarEventInput {
  accessToken: string;
  refreshToken: string;
  summary: string;
  description?: string;
  /** For in-person meetings or pasted location strings. */
  location?: string;
  start: Date;
  end: Date;
  attendeeEmails: string[];
  /**
   * When true, attach a `conferenceData.createRequest` so Google
   * generates a fresh Meet link for the event. The resulting URL comes
   * back on the response in `hangoutLink` / `conferenceData.entryPoints`.
   */
  withMeet?: boolean;
}

export interface CalendarEventResult {
  eventId: string;
  htmlLink: string;
  /** Populated when `withMeet=true` and Google succeeded in provisioning. */
  meetLink?: string;
}

/**
 * Thin wrapper around `googleapis` calendar.events.* that mirrors the
 * shape of `GmailService` — same OAuth2 client, same token refresh path
 * (handled upstream by `EmailAccountsService.getReadyForSend`). All
 * methods throw on Google-side failures so callers can record the error
 * on the meeting row; we never silently swallow.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly log = new Logger(GoogleCalendarService.name);

  private oauth2Client(accessToken: string, refreshToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI.',
      );
    }
    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return auth;
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
    const calendar = google.calendar({
      version: 'v3',
      auth: this.oauth2Client(input.accessToken, input.refreshToken),
    });
    try {
      const res = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'all',
        conferenceDataVersion: input.withMeet ? 1 : 0,
        requestBody: {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: { dateTime: input.start.toISOString(), timeZone: SERVER_TZ },
          end: { dateTime: input.end.toISOString(), timeZone: SERVER_TZ },
          attendees: dedupeAttendees(input.attendeeEmails),
          ...(input.withMeet
            ? {
                conferenceData: {
                  createRequest: {
                    requestId: `onspace-${Date.now()}-${Math.random()
                      .toString(36)
                      .slice(2, 10)}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                  },
                },
              }
            : {}),
        },
      });
      const eventId = res.data.id ?? '';
      const htmlLink = res.data.htmlLink ?? '';
      const meetLink = pickMeetLink(res.data);
      if (!eventId) throw new Error('Calendar API returned no event id');
      return { eventId, htmlLink, meetLink };
    } catch (err) {
      throw enrichError(err, 'createEvent');
    }
  }

  async updateEvent(
    input: CalendarEventInput & { eventId: string },
  ): Promise<{ meetLink?: string }> {
    const calendar = google.calendar({
      version: 'v3',
      auth: this.oauth2Client(input.accessToken, input.refreshToken),
    });
    try {
      const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId: input.eventId,
        sendUpdates: 'all',
        conferenceDataVersion: input.withMeet ? 1 : 0,
        requestBody: {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: { dateTime: input.start.toISOString(), timeZone: SERVER_TZ },
          end: { dateTime: input.end.toISOString(), timeZone: SERVER_TZ },
          attendees: dedupeAttendees(input.attendeeEmails),
          ...(input.withMeet
            ? {
                conferenceData: {
                  createRequest: {
                    requestId: `onspace-${Date.now()}-${Math.random()
                      .toString(36)
                      .slice(2, 10)}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                  },
                },
              }
            : {}),
        },
      });
      return { meetLink: pickMeetLink(res.data) };
    } catch (err) {
      throw enrichError(err, 'updateEvent');
    }
  }

  async deleteEvent(input: {
    accessToken: string;
    refreshToken: string;
    eventId: string;
  }): Promise<void> {
    const calendar = google.calendar({
      version: 'v3',
      auth: this.oauth2Client(input.accessToken, input.refreshToken),
    });
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: input.eventId,
        sendUpdates: 'all',
      });
    } catch (err) {
      throw enrichError(err, 'deleteEvent');
    }
  }
}

function pickMeetLink(
  data: { hangoutLink?: string | null; conferenceData?: any } | undefined,
): string | undefined {
  if (!data) return undefined;
  if (data.hangoutLink) return data.hangoutLink;
  const entries = data.conferenceData?.entryPoints as
    | { entryPointType?: string; uri?: string }[]
    | undefined;
  const video = entries?.find((e) => e.entryPointType === 'video' && e.uri);
  return video?.uri ?? undefined;
}

function dedupeAttendees(emails: string[]): { email: string }[] {
  const seen = new Set<string>();
  const out: { email: string }[] = [];
  for (const raw of emails ?? []) {
    if (!raw) continue;
    const e = raw.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push({ email: e });
  }
  return out;
}

function enrichError(err: unknown, op: string): Error {
  const e = err as { message?: string; code?: number; errors?: { message?: string }[] };
  const inner = e?.errors?.[0]?.message;
  let msg = inner || e?.message || String(err);
  // Helpful hint when the project's Calendar API is not enabled.
  if (
    e?.code === 403 ||
    /Calendar API has not been used|Calendar API is not enabled|accessNotConfigured/i.test(msg)
  ) {
    msg = `${msg} — enable the Google Calendar API for the OAuth project at https://console.cloud.google.com/apis/library/calendar-json.googleapis.com`;
  }
  const wrapped = new Error(`Calendar ${op} failed: ${msg}`);
  return wrapped;
}
