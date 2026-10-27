import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ClerkProfile } from "../../../src/accountAdapter";
export const scenario =
  new URLSearchParams(location.search).get("scenario") ?? "central";
type Session = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: ClerkProfile | null;
};
const user = {
  fullName: "Central Identity",
  username: "central",
  primaryEmailAddress: { emailAddress: "central@example.test" },
  hasImage: false,
};
const initial: Session = {
  isLoaded: scenario !== "loading",
  isSignedIn: scenario !== "signed-out",
  user: ["unavailable", "signed-out"].includes(scenario) ? null : user,
};
const Context = createContext({
  session: initial,
  signOut: async (_options?: unknown) => {},
});
export function FixtureIdentity({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(initial);
  const [calls, setCalls] = useState(0);
  const count = useRef(0);
  const signOut = async (_options?: unknown) => {
    const attempt = ++count.current;
    setCalls(attempt);
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (scenario === "retry" && attempt === 1)
      throw new Error("Synthetic sign-out failure");
    setSession({ isLoaded: true, isSignedIn: false, user: null });
  };
  return (
    <Context.Provider value={{ session, signOut }}>
      <span data-testid="sign-out-calls">{calls}</span>
      {children}
    </Context.Provider>
  );
}
export function useUser() {
  return useContext(Context).session;
}
export function useClerk() {
  return { signOut: useContext(Context).signOut };
}
export function useAuth() {
  const session = useUser();
  return {
    ...session,
    userId: session.isSignedIn ? "central-synthetic-id" : null,
    getToken: async () => null,
  };
}
export function useReverification<T>(fn: T) {
  return fn;
}
export function SignIn() {
  return <p>Synthetic sign-in fixture</p>;
}
export function UserProfile() {
  return <p>Legacy profile editor fixture</p>;
}
export function useData() {
  return {
    demo: scenario === "demo",
    local: scenario === "local",
    actorId: "local-actor",
    state: {
      members: [
        {
          id: "local-actor",
          role: "owner",
          name: "Local membership alias",
          email: "membership@example.test",
        },
      ],
    },
  };
}
