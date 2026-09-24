export type Action =
  "allow" | "ask" | "block" | "info" | "quarantine" | "project";
export type EvidenceRef = {
  path: string;
  caseId: string;
  kind: "fixture" | "recorded" | "test";
};
export type DemoEvent = {
  id: string;
  label: string;
  code: string;
  detail: string;
  action: Action;
  rule?: string;
  parent?: string;
  terminal?: boolean;
};
export type Mode = "c4" | "stateless" | "native" | "quarantine" | "projection";
export type Scenario = {
  id: string;
  title: string;
  short: string;
  description: string;
  task: string;
  source: EvidenceRef;
  modes: Mode[];
  defaultMode: Mode;
  events: (mode: Mode, variant?: string) => DemoEvent[];
};
export type Status =
  "idle" | "playing" | "paused" | "awaiting-review" | "completed";
export type DemoState = {
  status: Status;
  events: DemoEvent[];
  cursor: number;
  selected: number;
  reviews: Record<string, "approved" | "denied">;
};
export type Command =
  | { type: "load"; events: DemoEvent[] }
  | { type: "play" | "pause" | "next" | "reset" }
  | { type: "select"; index: number }
  | { type: "review"; approved: boolean };

export const initialState = (events: DemoEvent[]): DemoState => ({
  status: "idle",
  events,
  cursor: -1,
  selected: -1,
  reviews: {},
});
export function reducer(state: DemoState, command: Command): DemoState {
  switch (command.type) {
    case "load":
      return initialState(command.events);
    case "reset":
      return initialState(state.events);
    case "select":
      return command.index >= 0 && command.index <= state.cursor
        ? { ...state, selected: command.index }
        : state;
    case "play":
      return ["idle", "paused"].includes(state.status)
        ? { ...state, status: "playing" }
        : state;
    case "pause":
      return state.status === "playing"
        ? { ...state, status: "paused" }
        : state;
    case "next": {
      if (["awaiting-review", "completed"].includes(state.status)) return state;
      const cursor = state.cursor + 1;
      const event = state.events[cursor];
      if (!event) return { ...state, status: "completed" };
      const status: Status =
        event.action === "ask"
          ? "awaiting-review"
          : event.action === "block" ||
              event.terminal ||
              cursor === state.events.length - 1
            ? "completed"
            : state.status === "playing"
              ? "playing"
              : "paused";
      return { ...state, cursor, selected: cursor, status };
    }
    case "review": {
      if (state.status !== "awaiting-review") return state;
      const event = state.events[state.cursor];
      if (!event || event.action !== "ask" || state.reviews[event.id])
        return state;
      const reviews = {
        ...state.reviews,
        [event.id]: command.approved
          ? ("approved" as const)
          : ("denied" as const),
      };
      const done =
        !command.approved || state.cursor === state.events.length - 1;
      return { ...state, reviews, status: done ? "completed" : "playing" };
    }
  }
}
