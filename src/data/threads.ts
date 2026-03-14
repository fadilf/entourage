export type AgentModel = "claude" | "gemini" | "codex";

export type User = {
  id: string;
  name: string;
  avatarColor: string;
  model?: AgentModel;
};

export type Message = {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
};

export type Thread = {
  id: string;
  title: string;
  participants: User[];
  messages: Message[];
};

export const ME: User = {
  id: "me",
  name: "You",
  avatarColor: "#7c3aed",
};

const planner: User = {
  id: "planner",
  name: "Planner",
  avatarColor: "#d97706",
  model: "claude",
};

const reviewer: User = {
  id: "reviewer",
  name: "Reviewer",
  avatarColor: "#22c55e",
  model: "codex",
};

const designer: User = {
  id: "designer",
  name: "Designer",
  avatarColor: "#3b82f6",
  model: "gemini",
};

const visualizer: User = {
  id: "visualizer",
  name: "Visualizer",
  avatarColor: "#8b5cf6",
  model: "gemini",
};

const architect: User = {
  id: "architect",
  name: "Architect",
  avatarColor: "#ef4444",
  model: "claude",
};

const debugger_: User = {
  id: "debugger",
  name: "Debugger",
  avatarColor: "#06b6d4",
  model: "codex",
};

export const threads: Thread[] = [
  {
    id: "t1",
    title: "API Pagination Design",
    participants: [planner, reviewer],
    messages: [
      {
        id: "m1",
        senderId: "me",
        content:
          "I need a pagination strategy for the listings endpoint. We're expecting millions of rows — what approach should we take?",
        timestamp: "2026-03-13T09:15:00",
      },
      {
        id: "m2",
        senderId: "planner",
        content:
          "Cursor-based pagination is the way to go here. Offset pagination degrades badly past a few hundred thousand rows — query time grows linearly with the offset. I'll draft a phased rollout plan.",
        timestamp: "2026-03-13T09:22:00",
      },
      {
        id: "m3",
        senderId: "me",
        content:
          "Makes sense. What should the cursor token look like? Opaque string or structured?",
        timestamp: "2026-03-13T09:25:00",
      },
      {
        id: "m4",
        senderId: "reviewer",
        content:
          "I'd recommend an opaque base64-encoded token. Exposing internal IDs or timestamps in the cursor leaks implementation details and makes future schema changes harder. I'll flag anything like that in review.",
        timestamp: "2026-03-13T09:31:00",
      },
      {
        id: "m5",
        senderId: "me",
        content:
          "Perfect. Let's sync on the full plan during standup tomorrow.",
        timestamp: "2026-03-13T09:35:00",
      },
    ],
  },
  {
    id: "t2",
    title: "Staging Deploy Fix",
    participants: [debugger_, architect],
    messages: [
      {
        id: "m6",
        senderId: "me",
        content:
          "The staging deploy is failing on the auth service. Can you dig into it?",
        timestamp: "2026-03-12T14:00:00",
      },
      {
        id: "m7",
        senderId: "debugger",
        content:
          "Found it. The Redis connection string was rotated during last night's credential rotation, but the staging env vars weren't updated. The auth service is throwing ECONNREFUSED on startup. Patching the config now.",
        timestamp: "2026-03-12T14:12:00",
      },
      {
        id: "m8",
        senderId: "me",
        content:
          "That would explain it. Thanks for jumping on this so fast. @Architect can you take a look at this? We shouldn't be this fragile to credential rotations.",
        timestamp: "2026-03-12T14:15:00",
      },
      {
        id: "m8b",
        senderId: "architect",
        content:
          "Agreed, this is a gap. The auth service should be pulling secrets from Vault at startup instead of relying on static env vars. I'll draft an RFC for migrating all services to dynamic secret injection — that way credential rotations propagate automatically without redeploys.",
        timestamp: "2026-03-12T14:24:00",
      },
      {
        id: "m8c",
        senderId: "debugger",
        content:
          "That would've prevented this entirely. Happy to help validate the migration path once the RFC is ready — I can map out which services still use static secrets.",
        timestamp: "2026-03-12T14:28:00",
      },
      {
        id: "m8d",
        senderId: "me",
        content:
          "Perfect. Let's get the RFC out by end of week and prioritize the auth service migration first.",
        timestamp: "2026-03-12T14:32:00",
      },
    ],
  },
  {
    id: "t3",
    title: "Q2 Feature Proposals",
    participants: [planner, designer, visualizer],
    messages: [
      {
        id: "m9",
        senderId: "me",
        content:
          "Q2 planning kicks off next Monday. I need feature proposals from each of you by Friday. Keep them concise.",
        timestamp: "2026-03-11T10:00:00",
      },
      {
        id: "m10",
        senderId: "planner",
        content:
          "I'll put together a proposal around real-time sync improvements. I've been mapping out the dependency graph and there's a clean path to incremental delivery over the quarter.",
        timestamp: "2026-03-11T10:20:00",
      },
      {
        id: "m11",
        senderId: "me",
        content:
          "Great. I'm also thinking we should pitch the graph-based search feature — the prototype numbers were promising.",
        timestamp: "2026-03-11T10:45:00",
      },
      {
        id: "m12",
        senderId: "designer",
        content:
          "I can draft the search UX for that proposal. I have some ideas for a faceted search interface that would feel intuitive without overwhelming users.",
        timestamp: "2026-03-11T11:02:00",
      },
      {
        id: "m13",
        senderId: "visualizer",
        content:
          "I'll prepare comparison charts for the prototype metrics — latency improvements, relevance scores, etc. Visual evidence will make the pitch stronger.",
        timestamp: "2026-03-11T11:15:00",
      },
    ],
  },
  {
    id: "t4",
    title: "Component Library Style Guide",
    participants: [designer],
    messages: [
      {
        id: "m14",
        senderId: "me",
        content:
          "Do we have a style guide for the new component library yet? I don't want the team bikeshedding on spacing tokens.",
        timestamp: "2026-03-10T16:30:00",
      },
      {
        id: "m15",
        senderId: "designer",
        content:
          "I've started a foundations doc covering spacing, color, and typography. For spacing: 4px base grid, scale of 4/8/12/16/24/32/48. Colors use the existing palette with semantic aliases. I'll share the full guide by tomorrow.",
        timestamp: "2026-03-10T16:45:00",
      },
    ],
  },
  {
    id: "t5",
    title: "Connection Pooling Results",
    participants: [architect, reviewer, visualizer],
    messages: [
      {
        id: "m16",
        senderId: "me",
        content:
          "The load test finished. Let's review the connection pooling results together.",
        timestamp: "2026-03-09T11:00:00",
      },
      {
        id: "m17",
        senderId: "architect",
        content:
          "The numbers look strong. p99 latency dropped from 340ms to 180ms. The architecture change from per-request connections to a shared pool with 50 max connections is paying off exactly as modeled.",
        timestamp: "2026-03-09T11:10:00",
      },
      {
        id: "m18",
        senderId: "reviewer",
        content:
          "I reviewed the implementation — it's clean. One concern: I see a 12% RSS increase per instance. Within headroom, but we should add a memory usage alert so it doesn't creep up unnoticed.",
        timestamp: "2026-03-09T11:20:00",
      },
      {
        id: "m19",
        senderId: "visualizer",
        content:
          "I've charted the before/after latency distributions and the memory delta. Ready to include these in the rollout review deck whenever you need them.",
        timestamp: "2026-03-09T11:30:00",
      },
      {
        id: "m20",
        senderId: "me",
        content:
          "Great work everyone. I'll prep the rollout plan and add monitoring dashboards before the freeze lifts on Wednesday.",
        timestamp: "2026-03-09T11:45:00",
      },
    ],
  },
];
