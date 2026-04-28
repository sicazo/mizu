import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import NoteList from "./components/NoteList";
import Editor from "./components/Editor";
import AiPanel from "./components/AiPanel";
import TodayView from "./components/TodayView";
import ScheduleView from "./components/ScheduleView";
import GradesView from "./components/GradesView";
import CourseOverview from "./components/CourseOverview";
import CommandPalette from "./components/CommandPalette";
import SettingsPanel from "./components/SettingsPanel";
import Onboarding, { type DetectedCourse } from "./components/Onboarding";
import { type CalEvent } from "./lib/events";

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

export default function App() {
  const [setupDone, setSetupDone] = useState(() => !!localStorage.getItem("mizu-setup-complete"));
  const [courses, setCourses] = useState<Record<string, { code: string; name: string; color: string }>>(loadCourses);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [thresholds, setThresholds] = useState<GradeThresholds>(loadThresholds);

  const [activeNav, setActiveNav] = useState("today");
  const [courseView, setCourseView] = useState<"overview" | "notes">("overview");
  const [activeNote, setActiveNote] = useState("n14");

  function handleNavSelect(id: string) {
    setActiveNav(id);
    if (courses[id]) setCourseView("overview");
  }
  const [showAi, setShowAi] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (setupDone) {
      invoke<CalEvent[]>("sync_calendar").then(setEvents).catch(console.error);
    }
  }, [setupDone]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleThresholdsChange(next: GradeThresholds) {
    setThresholds(next);
    localStorage.setItem("mizu-grade-thresholds", JSON.stringify(next));
  }

  function handleOnboardingComplete(detected: DetectedCourse[]) {
    const map = Object.fromEntries(
      detected.map((c) => [c.code.toLowerCase().replace("-", ""), { code: c.code, name: c.name, color: c.color }])
    );
    setCourses(map);
    setSetupDone(true);
    invoke<CalEvent[]>("sync_calendar").then(setEvents).catch(console.error);
  }

  function handleResetOnboarding() {
    setCourses({});
    setEvents([]);
    setSetupDone(false);
    setShowSettings(false);
  }

  if (!setupDone) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const isToday = activeNav === "today";
  const isSchedule = activeNav === "schedule";
  const isGrades = activeNav === "grades";
  const course = courses[activeNav];

  let breadcrumb: string[];
  if (isToday) breadcrumb = ["Mizu", "Today"];
  else if (isSchedule) breadcrumb = ["Mizu", "Schedule"];
  else if (isGrades) breadcrumb = ["Mizu", "Grades"];
  else if (course) breadcrumb = ["Mizu", course.code];
  else breadcrumb = ["Mizu", activeNav];

  return (
    <div className="app">
      <TitleBar
        breadcrumb={breadcrumb}
        onTogglePalette={() => setShowPalette(true)}
        onToggleAi={() => setShowAi((v) => !v)}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
        onToggleSettings={() => setShowSettings((v) => !v)}
        theme={theme}
      />
      <div className="app-body">
        <Sidebar activeId={activeNav} onSelect={handleNavSelect} courses={courses} />
        {isToday ? (
          <TodayView events={events} courses={courses} />
        ) : isSchedule ? (
          <ScheduleView events={events} courses={courses} />
        ) : isGrades ? (
          <GradesView courses={courses} thresholds={thresholds} />
        ) : course ? (
          courseView === "notes" ? (
            <>
              <NoteList
                activeId={activeNote}
                onSelect={setActiveNote}
                courseColor={course.color}
                courseCode={course.code}
                courseName={course.name}
                onBack={() => setCourseView("overview")}
              />
              <Editor />
            </>
          ) : (
            <CourseOverview
              course={course}
              courseId={activeNav}
              events={events}
              courses={courses}
              onOpenNotes={() => setCourseView("notes")}
            />
          )
        ) : (
          <div className="empty-pane">
            <div className="empty-mark">水</div>
            <div className="empty-title">Pick a course or view from the sidebar</div>
          </div>
        )}
        {showAi && !isToday && !isSchedule && !isGrades && !showSettings && <AiPanel onClose={() => setShowAi(false)} />}
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onResetOnboarding={handleResetOnboarding}
            thresholds={thresholds}
            onThresholdsChange={handleThresholdsChange}
          />
        )}
      </div>
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
    </div>
  );
}
