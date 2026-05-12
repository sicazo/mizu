import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getNotesRoot, notesApi, type ApiNoteSummary, type ApiNoteDocument } from "./lib/notesApi";
import "./App.css";
import TitleBar from "./components/TitleBar";
import { useUpdater } from "./hooks/useUpdater";
import Sidebar from "./components/Sidebar";
import NoteList from "./components/NoteList";
import Editor from "./components/Editor";
import { useNotes } from "./hooks/useNotes";
import AiPanel from "./components/AiPanel";
import TodayView from "./components/TodayView";
import ScheduleView from "./components/ScheduleView";
import GradesView from "./components/GradesView";
import CourseOverview from "./components/CourseOverview";
import CommandPalette, { type PaletteCommand } from "./components/CommandPalette";
import SettingsPanel from "./components/SettingsPanel";
import Onboarding, { type DetectedCourse } from "./components/Onboarding";
import { type CalEvent } from "./lib/events";
import { useUiActions } from "./hooks/useUiActions";
import StatusBar from "./components/StatusBar";
import { useAiSettings } from "./hooks/useAiSettings";

export type GradeThresholds = { 1: number; 2: number; 3: number; 4: number; 5: number };

const DEFAULT_THRESHOLDS: GradeThresholds = { 1: 90, 2: 80, 3: 70, 4: 60, 5: 50 };

function loadThresholds(): GradeThresholds {
  try {
    const stored = localStorage.getItem("mizu-grade-thresholds");
    if (!stored) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function loadCourses(): Record<string, { code: string; name: string; color: string }> {
  try {
    const stored = localStorage.getItem("mizu-courses");
    if (!stored) return {};
    const arr: DetectedCourse[] = JSON.parse(stored);
    return Object.fromEntries(
      arr.map((c) => [c.code.toLowerCase().replace("-", ""), { code: c.code, name: c.name, color: c.color }])
    );
  } catch {
    return {};
  }
}

function loadTheme(): "light" | "dark" {
  const stored = localStorage.getItem("mizu-theme");
  return stored === "light" ? "light" : "dark";
}

export default function App() {
  const { status: updateStatus, actions: updateActions } = useUpdater();
  const [setupDone, setSetupDone] = useState(() => !!localStorage.getItem("mizu-setup-complete"));
  const [courses, setCourses] = useState<Record<string, { code: string; name: string; color: string }>>(loadCourses);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [thresholds, setThresholds] = useState<GradeThresholds>(loadThresholds);

  const [activeNav, setActiveNav] = useState("today");
  const [courseView, setCourseView] = useState<"overview" | "notes">("overview");

  const isCourseActive = !!courses[activeNav];
  const {
    notes,
    activeNote,
    selectNote,
    saveNote,
    updateMeta,
    createNote,
    deleteNote,
  } = useNotes(isCourseActive ? activeNav : "");

  const [allNotes, setAllNotes] = useState<ApiNoteSummary[]>([]);
  const [allNotesActive, setAllNotesActive] = useState<ApiNoteDocument | null>(null);
  const allNotesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshAllNotes = useCallback(async () => {
    try {
      const list = await notesApi.listAll();
      setAllNotes(list);
    } catch (err) {
      console.error("[App] Failed to load all notes:", err);
    }
  }, []);
  useEffect(() => {
    if (setupDone) refreshAllNotes();
  }, [setupDone, refreshAllNotes, notes.length]);

  const selectAllNotesNote = useCallback(async (id: string) => {
    const summary = allNotes.find((n) => n.id === id);
    if (!summary) return;
    try {
      const doc = await notesApi.get(id, summary.courseId);
      setAllNotesActive(doc);
    } catch (err) {
      console.error("[App] Failed to load all-notes document:", err);
    }
  }, [allNotes]);

  const flushAllNotesSave = useCallback(async (doc: ApiNoteDocument) => {
    try {
      const savedId = await notesApi.save({
        id: doc.id,
        course_id: doc.courseId,
        title: doc.title,
        content: doc.content,
        lecture_num: doc.lectureNum,
        lecture_date: doc.lectureDate,
        location: doc.location,
        pinned: doc.pinned,
      });
      if (savedId !== doc.id) {
        setAllNotesActive({ ...doc, id: savedId });
      }
      await refreshAllNotes();
    } catch (err) {
      console.error("[App] Failed to save all-notes document:", err);
    }
  }, [refreshAllNotes]);

  const saveAllNotesNote = useCallback((content: string, title?: string) => {
    setAllNotesActive((current) => {
      if (!current) return current;
      const updated = { ...current, content, title: title ?? current.title };
      if (allNotesSaveTimerRef.current) clearTimeout(allNotesSaveTimerRef.current);
      allNotesSaveTimerRef.current = setTimeout(() => flushAllNotesSave(updated), 500);
      return updated;
    });
  }, [flushAllNotesSave]);

  const updateAllNotesMeta = useCallback((patch: Partial<{ title: string; lectureNum: number | null; lectureDate: string | null; location: string | null; pinned: boolean }>) => {
    setAllNotesActive((current) => {
      if (!current) return current;
      const updated = { ...current, ...patch };
      if (allNotesSaveTimerRef.current) clearTimeout(allNotesSaveTimerRef.current);
      allNotesSaveTimerRef.current = setTimeout(() => flushAllNotesSave(updated), 500);
      return updated;
    });
  }, [flushAllNotesSave]);

  const deleteAllNotesNote = useCallback(async () => {
    if (!allNotesActive) return;
    try {
      await notesApi.delete(allNotesActive.id, allNotesActive.courseId);
      setAllNotesActive(null);
      await refreshAllNotes();
    } catch (err) {
      console.error("[App] Failed to delete all-notes document:", err);
    }
  }, [allNotesActive, refreshAllNotes]);

  const [queuedAiPrompt, setQueuedAiPrompt] = useState<string | null>(null);

  const toggleNotePin = useCallback(async (note: ApiNoteSummary) => {
    try {
      const doc = await notesApi.get(note.id, note.courseId);
      await notesApi.save({
        id: doc.id,
        course_id: doc.courseId,
        title: doc.title,
        content: doc.content,
        lecture_num: doc.lectureNum,
        lecture_date: doc.lectureDate,
        location: doc.location,
        pinned: !doc.pinned,
      });
      await refreshAllNotes();
      if (activeNote?.id === doc.id && activeNav === doc.courseId) {
        updateMeta({ pinned: !doc.pinned });
      }
      if (allNotesActive?.id === doc.id) {
        setAllNotesActive({ ...allNotesActive, pinned: !doc.pinned });
      }
    } catch (err) {
      console.error("[App] Failed to toggle note pin:", err);
    }
  }, [refreshAllNotes, activeNote?.id, activeNav, updateMeta, allNotesActive]);
  const [queuedAiPromptNonce, setQueuedAiPromptNonce] = useState(0);
  const [aiFocusNonce, setAiFocusNonce] = useState(0);

  function handleNavSelect(id: string) {
    setActiveNav(id);
    if (courses[id]) setCourseView("overview");
  }
  const [showAi, setShowAi] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);

  const aiSettings = useAiSettings();

  const {
    activeView: remoteActiveView,
    activeCourseId: remoteActiveCourseId,
    theme: remoteTheme,
    showAiPanel: remoteShowAiPanel,
    aiQuery: remoteAiQuery,
  } = useUiActions();

  useEffect(() => {
    if (setupDone) {
      invoke<CalEvent[]>("sync_calendar").then(setEvents).catch(console.error);
    }
  }, [setupDone]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("mizu-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (remoteTheme === "light" || remoteTheme === "dark") {
      setTheme(remoteTheme);
    }
  }, [remoteTheme]);

  useEffect(() => {
    if (typeof remoteShowAiPanel === "boolean") {
      setShowAi(remoteShowAiPanel);
    }
  }, [remoteShowAiPanel]);

  useEffect(() => {
    if (!remoteActiveView) return;

    if (remoteActiveView === "today" || remoteActiveView === "schedule" || remoteActiveView === "grades") {
      setActiveNav(remoteActiveView);
      return;
    }

    if (remoteActiveCourseId && courses[remoteActiveCourseId]) {
      setActiveNav(remoteActiveCourseId);
      setCourseView(remoteActiveView === "course_notes" ? "notes" : "overview");
    }
  }, [remoteActiveView, remoteActiveCourseId, courses]);

  useEffect(() => {
    if (!remoteAiQuery) return;
    setShowAi(true);
    setQueuedAiPrompt(remoteAiQuery);
    setQueuedAiPromptNonce((n) => n + 1);
  }, [remoteAiQuery]);

  useEffect(() => {
    return () => {
      if (allNotesSaveTimerRef.current) clearTimeout(allNotesSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setShowPalette(true);
      } else if (key === "j") {
        e.preventDefault();
        setShowAi((v) => !v);
      } else if (key === "t") {
        e.preventDefault();
        setActiveNav("today");
      } else if (key === "\\") {
        e.preventDefault();
        setShowSidebar((v) => !v);
      } else if (key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleThresholdsChange(next: GradeThresholds) {
    setThresholds(next);
    localStorage.setItem("mizu-grade-thresholds", JSON.stringify(next));
  }

  function handleOnboardingComplete(detected: DetectedCourse[], _icalUrl: string, notesRoot: string) {
    const map = Object.fromEntries(
      detected.map((c) => [c.code.toLowerCase().replace("-", ""), { code: c.code, name: c.name, color: c.color }])
    );
    setCourses(map);
    if (notesRoot) localStorage.setItem("mizu-notes-root", notesRoot);
    setSetupDone(true);
    invoke<CalEvent[]>("sync_calendar").then(setEvents).catch(console.error);
  }

  function handleResetOnboarding() {
    setCourses({});
    setEvents([]);
    setSetupDone(false);
    setShowSettings(false);
  }

  const isToday = activeNav === "today";
  const isSchedule = activeNav === "schedule";
  const isGrades = activeNav === "grades";
  const isAllNotes = activeNav === "all";
  const isPinnedNotes = activeNav === "pinned";
  const course = courses[activeNav];
  const isCourseNotesView = !!course && courseView === "notes";
  const editorActiveNote = (isAllNotes || isPinnedNotes) ? allNotesActive : activeNote;
  const editorCourseId = (isAllNotes || isPinnedNotes) ? (allNotesActive?.courseId ?? "") : activeNav;
  const editorCourse = courses[editorCourseId];
  const isNotesView = isCourseNotesView || isAllNotes || isPinnedNotes;
  const notesRoot = getNotesRoot();
  const sep = notesRoot.includes("\\") && !notesRoot.includes("/") ? "\\" : "/";
  const noteFilePath = editorActiveNote?.id && notesRoot && editorCourseId
    ? `${notesRoot.replace(/[\\/]+$/, "")}${sep}${editorCourseId}${sep}${editorActiveNote.id}.md`
    : null;

  let breadcrumb: string[];
  if (isToday) breadcrumb = ["Mizu", "Today"];
  else if (isSchedule) breadcrumb = ["Mizu", "Schedule"];
  else if (isGrades) breadcrumb = ["Mizu", "Grades"];
  else if (isAllNotes) breadcrumb = ["Mizu", "All Notes"];
  else if (isPinnedNotes) breadcrumb = ["Mizu", "Pinned"];
  else if (course) breadcrumb = ["Mizu", course.code];
  else breadcrumb = ["Mizu", activeNav];

  useEffect(() => {
    if (!isNotesView) setShowProperties(false);
  }, [isNotesView]);

  if (!setupDone) {
    return <Onboarding onComplete={(courses, icalUrl, notesRoot) => handleOnboardingComplete(courses, icalUrl, notesRoot)} />;
  }

  return (
    <div className="app">
      <TitleBar
        breadcrumb={breadcrumb}
        onToggleAi={() => setShowAi((v) => !v)}
        editorActions={isNotesView ? {
          showAi,
          showProperties,
          canToggleProperties: !!editorActiveNote,
          noteFilePath,
          onToggleProperties: () => setShowProperties((v) => !v),
        } : undefined}
      />
      <div className="app-body">
        {showSidebar && <Sidebar activeId={activeNav} onSelect={handleNavSelect} courses={courses} allNotesCount={allNotes.length} pinnedCount={allNotes.filter((n) => n.pinned).length} />}
        {isToday ? (
          <TodayView events={events} courses={courses} />
        ) : isSchedule ? (
          <ScheduleView events={events} courses={courses} />
        ) : isGrades ? (
          <GradesView courses={courses} thresholds={thresholds} events={events} />
        ) : (isAllNotes || isPinnedNotes) ? (
          <>
            <NoteList
              notes={isPinnedNotes ? allNotes.filter((n) => n.pinned) : allNotes}
              activeId={allNotesActive?.id ?? null}
              onSelect={selectAllNotesNote}
              courseColor="#6B7280"
              courseCode="All Notes"
              courseName="All Notes"
              showCourseTag
              onTogglePin={toggleNotePin}
            />
            <Editor
              noteId={allNotesActive?.id ?? null}
              noteContent={allNotesActive?.content ?? ""}
              activeNote={allNotesActive}
              courseCode={editorCourse?.code ?? allNotesActive?.courseId ?? "ALL"}
              courseColor={editorCourse?.color ?? "#6B7280"}
              courseId={editorCourseId || "all"}
              courses={courses}
              events={events}
              lectureNum={allNotesActive?.lectureNum ?? null}
              lectureDate={allNotesActive?.lectureDate ?? null}
              onChange={saveAllNotesNote}
              onUpdateMeta={updateAllNotesMeta}
              onDelete={deleteAllNotesNote}
              showPanel={showProperties}
              onTogglePanel={() => setShowProperties((v) => !v)}
            />
          </>
        ) : course ? (
          courseView === "notes" ? (
            <>
              <NoteList
                notes={notes}
                activeId={activeNote?.id ?? null}
                onSelect={selectNote}
                onCreateNote={() => createNote()}
                courseColor={course.color}
                courseCode={course.code}
                courseName={course.name}
                onBack={() => setCourseView("overview")}
                onTogglePin={toggleNotePin}
              />
              <Editor
                noteId={activeNote?.id ?? null}
                noteContent={activeNote?.content ?? ""}
                activeNote={activeNote}
                courseCode={course.code}
                courseColor={course.color}
                courseId={activeNav}
                courses={courses}
                events={events}
                lectureNum={activeNote?.lectureNum ?? null}
                lectureDate={activeNote?.lectureDate ?? null}
                onChange={saveNote}
                onUpdateMeta={updateMeta}
                onDelete={() => activeNote && deleteNote(activeNote.id)}
                showPanel={showProperties}
                onTogglePanel={() => setShowProperties((v) => !v)}
              />
            </>
          ) : (
            <CourseOverview
              course={course}
              courseId={activeNav}
              events={events}
              notes={notes}
              onOpenNotes={() => setCourseView("notes")}
            />
          )
        ) : (
          <div className="empty-pane">
            <div className="empty-mark">水</div>
            <div className="empty-title">Pick a course or view from the sidebar</div>
          </div>
        )}
        {showAi && !showSettings && (
          <AiPanel
            onClose={() => setShowAi(false)}
            courseId={editorCourseId || undefined}
            noteContent={editorActiveNote?.content}
            noteTitle={editorActiveNote?.title}
            initialPrompt={queuedAiPrompt}
            initialPromptNonce={queuedAiPromptNonce}
            focusNonce={aiFocusNonce}
            aiSettings={aiSettings}
          />
        )}
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onResetOnboarding={handleResetOnboarding}
            thresholds={thresholds}
            onThresholdsChange={handleThresholdsChange}
          />
        )}
      </div>
      <StatusBar
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onOpenAi={() => {
          setShowAi(true);
          setAiFocusNonce((n) => n + 1);
        }}
        aiSettings={aiSettings}
        updateStatus={updateStatus}
        updateActions={updateActions}
      />
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          commands={[
            {
              id: "go-today",
              section: "NAVIGATION",
              label: "Go to today",
              kbd: "⌘T",
              run: () => setActiveNav("today"),
            },
            {
              id: "toggle-sidebar",
              section: "NAVIGATION",
              label: "Toggle sidebar",
              kbd: "⌘\\",
              run: () => setShowSidebar((v) => !v),
            },
            {
              id: "toggle-ai",
              section: "NAVIGATION",
              label: "Toggle AI panel",
              kbd: "⌘J",
              run: () => {
                setShowAi((v) => !v);
                setAiFocusNonce((n) => n + 1);
              },
            },
            {
              id: "open-settings",
              section: "NAVIGATION",
              label: "Open settings",
              kbd: "⌘,",
              run: () => setShowSettings(true),
            },
            {
              id: "ask-ai",
              section: "AI",
              label: "Ask the vault…",
              kbd: "",
              run: () => {
                setShowAi(true);
                setAiFocusNonce((n) => n + 1);
              },
            },
          ] satisfies PaletteCommand[]}
        />
      )}
    </div>
  );
}
