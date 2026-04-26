import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface CalEvent {
  uid: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  description: string | null;
  sequence: number;
}

function App() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchCalendar() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setEvents(null);
    try {
      const result = await invoke<CalEvent[]>("fetch_calendar", { url });
      setEvents(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Calendar Viewer</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          fetchCalendar();
        }}
      >
        <input
          id="url-input"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="Enter iCal URL..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {events !== null && (
        <pre className="json-output">{JSON.stringify(events, null, 2)}</pre>
      )}
    </main>
  );
}

export default App;
