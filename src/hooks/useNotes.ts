import { useState, useEffect, useRef, useCallback } from "react";
import { notesApi, type ApiNoteSummary, type ApiNoteDocument } from "../lib/notesApi";
import type { LectureSeed } from "../lib/notes";

const SAVE_DEBOUNCE_MS = 500;

export interface UseNotesResult {
  notes: ApiNoteSummary[];
  activeNote: ApiNoteDocument | null;
  loading: boolean;
  selectNote: (id: string) => void;
  saveNote: (content: string, title?: string) => void;
  updateMeta: (patch: Partial<{ title: string; lectureNum: number | null; lectureDate: string | null; location: string | null; pinned: boolean }>) => void;
  createNote: (seed?: LectureSeed) => Promise<string>;
  deleteNote: (id: string) => void;
}

export function useNotes(courseId: string): UseNotesResult {
  const [notes, setNotes] = useState<ApiNoteSummary[]>([]);
  const [activeNote, setActiveNote] = useState<ApiNoteDocument | null>(null);
  const [loading, setLoading] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteRef = useRef<ApiNoteDocument | null>(null);
  activeNoteRef.current = activeNote;

  const refreshList = useCallback(async () => {
    if (!courseId) return;
    try {
      const list = await notesApi.list(courseId);
      setNotes(list);
    } catch (err) {
      console.error("[useNotes] Failed to load notes list:", err);
    }
  }, [courseId]);

  useEffect(() => {
    setActiveNote(null);
    setNotes([]);
    refreshList();
  }, [courseId, refreshList]);

  const selectNote = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const doc = await notesApi.get(id, courseId);
      setActiveNote(doc);
    } catch (err) {
      console.error("[useNotes] Failed to load note:", err);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const flushSave = useCallback(async (note: ApiNoteDocument) => {
    try {
      const savedId = await notesApi.save({
        id: note.id,
        course_id: note.courseId,
        title: note.title,
        content: note.content,
        lecture_num: note.lectureNum,
        lecture_date: note.lectureDate,
        location: note.location,
        pinned: note.pinned,
      });

      if (savedId !== note.id) {
        const renamed: ApiNoteDocument = { ...note, id: savedId };
        setActiveNote(renamed);
        activeNoteRef.current = renamed;
      }

      await refreshList();
    } catch (err) {
      console.error("[useNotes] Failed to save note:", err);
    }
  }, [refreshList]);

  const saveNote = useCallback((content: string, title?: string) => {
    const current = activeNoteRef.current;
    if (!current) return;

    const updated: ApiNoteDocument = {
      ...current,
      content,
      title: title ?? current.title,
    };
    setActiveNote(updated);
    activeNoteRef.current = updated;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushSave(updated);
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const updateMeta = useCallback((patch: Partial<{ title: string; lectureNum: number | null; lectureDate: string | null; location: string | null; pinned: boolean }>) => {
    const current = activeNoteRef.current;
    if (!current) return;
    const updated: ApiNoteDocument = { ...current, ...patch };
    setActiveNote(updated);
    activeNoteRef.current = updated;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushSave(updated);
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const createNote = useCallback(async (seed?: LectureSeed): Promise<string> => {
    const id = "untitled-note";
    const title = seed
      ? seed.title || `${seed.courseCode} Notes`
      : "Untitled note";
    const lectureNum = seed?.lectureNumber ?? null;
    const lectureDate = seed?.startsAt ? seed.startsAt.slice(0, 10) : null;

    const savedId = await notesApi.save({
      id,
      course_id: courseId,
      title,
      content: "",
      lecture_num: lectureNum,
      lecture_date: lectureDate,
      location: seed?.location ?? null,
      pinned: false,
    });

    await refreshList();

    const doc: ApiNoteDocument = {
      id: savedId,
      courseId,
      title,
      content: "",
      lectureNum,
      lectureDate,
      location: seed?.location ?? null,
      pinned: false,
    };
    setActiveNote(doc);
    return savedId;
  }, [courseId, refreshList]);

  const deleteNote = useCallback(async (id: string) => {
    try {
      await notesApi.delete(id, courseId);
      if (activeNoteRef.current?.id === id) {
        setActiveNote(null);
      }
      await refreshList();
    } catch (err) {
      console.error("[useNotes] Failed to delete note:", err);
    }
  }, [courseId, refreshList]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { notes, activeNote, loading, selectNote, saveNote, updateMeta, createNote, deleteNote };
}
