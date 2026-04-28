import { type CalEvent, type Course, matchToCourse } from "./events";

export interface VaultStatus {
  path: string;
  branch: string;
  hasRemote: boolean;
  remoteUrl: string | null;
  dirtyFiles: number;
}

export interface NoteSummary {
  id: string;
  path: string;
  title: string;
  preview: string;
  lecture: number | null;
  dateLabel: string;
  courseCode: string;
  modifiedAt: number | null;
}

export interface NoteDocument {
  path: string;
  title: string;
  content: string;
  courseCode: string;
  courseName: string | null;
  lecture: number | null;
  date: string | null;
  location: string | null;
}

export interface LectureSeed {
  courseCode: string;
  courseName: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  lectureNumber: number | null;
}

function extractLectureNumber(summary: string): number | null {
  const match = summary.match(/\b(?:lecture|lec\.?)\s*(\d+)\b/i);
  if (match) return Number(match[1]);
  return null;
}

function courseDisplayTitle(summary: string, course: Course): string {
  const cleaned = summary
    .replace(new RegExp(`\\b${course.code.replace("-", "[- ]?")}\\b`, "i"), "")
    .replace(course.name, "")
    .replace(/^[-–—·:,\s]+|[-–—·:,\s]+$/g, "")
    .trim();

  return cleaned || course.name || course.code;
}

export function buildLectureSeeds(
  events: CalEvent[],
  courses: Record<string, Course>,
): LectureSeed[] {
  return events
    .map((event) => {
      const match = matchToCourse(event.summary, courses);
      if (!match) return null;
      return {
        courseCode: match.course.code,
        courseName: match.course.name,
        title: courseDisplayTitle(event.summary, match.course),
        startsAt: event.start,
        endsAt: event.end,
        location: event.location,
        lectureNumber: extractLectureNumber(event.summary),
      } satisfies LectureSeed;
    })
    .filter((value): value is LectureSeed => value !== null);
}
