import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { NoteInput } from "./notes";

interface RawNoteSummary {
  id: string;
  course_id: string;
  title: string;
  preview: string;
  lecture_num: number | null;
  lecture_date: string | null;
  pinned: boolean;
  modified_at: string;
}

interface RawNoteDocument {
  id: string;
  course_id: string;
  title: string;
  content: string;
  lecture_num: number | null;
  lecture_date: string | null;
  location: string | null;
  pinned: boolean;
}

export interface ApiNoteSummary {
  id: string;
  courseId: string;
  title: string;
  preview: string;
  lectureNum: number | null;
  lectureDate: string | null;
  pinned: boolean;
  modifiedAt: string;
}

export interface ApiNoteDocument {
  id: string;
  courseId: string;
  title: string;
  content: string;
  lectureNum: number | null;
  lectureDate: string | null;
  location: string | null;
  pinned: boolean;
}

function mapSummary(raw: RawNoteSummary): ApiNoteSummary {
  return {
    id: raw.id,
    courseId: raw.course_id,
    title: raw.title,
    preview: raw.preview,
    lectureNum: raw.lecture_num,
    lectureDate: raw.lecture_date,
    pinned: raw.pinned,
    modifiedAt: raw.modified_at,
  };
}

function mapDocument(raw: RawNoteDocument): ApiNoteDocument {
  return {
    id: raw.id,
    courseId: raw.course_id,
    title: raw.title,
    content: raw.content,
    lectureNum: raw.lecture_num,
    lectureDate: raw.lecture_date,
    location: raw.location,
    pinned: raw.pinned,
  };
}

export function getNotesRoot(): string {
  return localStorage.getItem("mizu-notes-root") ?? "";
}

export const notesApi = {
  pickFolder: (): Promise<string | null> =>
    invoke<string | null>("notes_pick_folder"),

  listAll: async (): Promise<ApiNoteSummary[]> => {
    const notesRoot = getNotesRoot();
    if (!notesRoot) return [];
    const rows = await invoke<RawNoteSummary[]>("notes_list_all", { notesRoot });
    return rows.map(mapSummary);
  },

  list: async (courseId: string): Promise<ApiNoteSummary[]> => {
    const notesRoot = getNotesRoot();
    if (!notesRoot) return [];
    const rows = await invoke<RawNoteSummary[]>("notes_list", { notesRoot, courseId });
    return rows.map(mapSummary);
  },

  get: async (id: string, courseId: string): Promise<ApiNoteDocument> => {
    const notesRoot = getNotesRoot();
    const raw = await invoke<RawNoteDocument>("note_get", { notesRoot, id, courseId });
    return mapDocument(raw);
  },

  save: (note: NoteInput): Promise<string> => {
    const notesRoot = getNotesRoot();
    return invoke<string>("note_save", { notesRoot, note });
  },

  delete: (id: string, courseId: string): Promise<void> => {
    const notesRoot = getNotesRoot();
    return invoke<void>("note_delete", { notesRoot, id, courseId });
  },

  importAttachment: async (courseId: string, fileName: string, bytes: number[]): Promise<string> => {
    const notesRoot = getNotesRoot();
    const absolutePath = await invoke<string>("note_import_attachment", {
      notesRoot,
      courseId,
      fileName,
      bytes,
    });
    return convertFileSrc(absolutePath);
  },
};
