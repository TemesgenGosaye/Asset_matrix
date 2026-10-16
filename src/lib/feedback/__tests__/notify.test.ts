// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FEEDBACK_DURATIONS,
  FEEDBACK_MAX_VISIBLE,
  getProgress,
  list,
  notify,
  pause,
  resume,
  subscribe,
} from "@/lib/feedback/notify";
import { setLocale } from "@/lib/i18n";

/**
 * The behavioural rules of the shared feedback system.
 *
 * Each of these is a rule a caller cannot see in the type signature and cannot
 * be trusted to hold by inspection, because every one of them was violated
 * somewhere in the app before the system existed: the same sentence stacked
 * three times on a double-click, a failure vanished before it could be read, a
 * success outranked the error printed after it. They are asserted here because
 * they are the whole contract.
 */

beforeEach(() => {
  vi.useFakeTimers();
  notify.clear();
  setLocale("en");
});

afterEach(() => {
  notify.clear();
  vi.useRealTimers();
  setLocale("en");
});

describe("notify — deduplication", () => {
  it("never stacks two identical messages", () => {
    // A double-clicked button, a re-render that re-runs an effect, or Strict
    // Mode's double invocation would otherwise put three copies on screen.
    const first = notify.success("Kit created");
    const second = notify.success("Kit created");

    expect(second).toBe(first);
    expect(list()).toHaveLength(1);
  });

  it("treats the same title with a different detail as two messages", () => {
    notify.success({ title: "Kit created", description: "Kit A" });
    notify.success({ title: "Kit created", description: "Kit B" });
    expect(list()).toHaveLength(2);
  });

  it("lets a caller say two identical-looking messages are not the same", () => {
    // Two approvals both read "Allocation approved" but are different events;
    // without a distinguishing key they would collapse into one card and the
    // second operator would see no confirmation at all.
    notify.success({ title: "Allocation approved", dedupeKey: "alloc-1" });
    notify.success({ title: "Allocation approved", dedupeKey: "alloc-2" });
    expect(list()).toHaveLength(2);
  });

  it("does not dedupe across weights", () => {
    // The same words mean opposite things depending on whether it worked.
    notify.error("Failed to save");
    notify.success("Failed to save");
    expect(list()).toHaveLength(2);
  });
});

describe("notify — the stack", () => {
  it("shows at most three and drops the oldest", () => {
    // More than three is a queue of failures the user has stopped reading. The
    // newest survives; the one that has been on screen longest goes.
    for (let i = 0; i < 5; i += 1) notify.success(`Message ${i}`);

    const visible = list();
    expect(visible).toHaveLength(FEEDBACK_MAX_VISIBLE);
    expect(visible.map((t) => t.title)).toEqual([
      "Message 2",
      "Message 3",
      "Message 4",
    ]);
  });

  it("keeps the newest last, which is what the viewport anchors on", () => {
    notify.success("First");
    notify.success("Second");
    const visible = list();
    expect(visible[visible.length - 1].title).toBe("Second");
  });

  it("notifies subscribers only when the list actually changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    notify.success("One");
    expect(listener).toHaveBeenCalledTimes(1);

    // A duplicate is a no-op; re-rendering with the same message must not wake
    // the viewport.
    notify.success("One");
    expect(listener).toHaveBeenCalledTimes(1);

    notify.dismiss(list()[0].id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    notify.success("Two");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("notify — durations", () => {
  it("clears a success on its own", () => {
    notify.success("Saved");
    expect(list()).toHaveLength(1);

    vi.advanceTimersByTime(FEEDBACK_DURATIONS.success + 10);
    expect(list()).toHaveLength(0);
  });

  it("gives a failure longer on screen than a success, then lets it go", () => {
    // The user did not ask for the failure, so it earns roughly double the
    // read time — but it is still finite. A card that never leaves the centre
    // of the screen is a dialog nobody chose to open.
    notify.error("Failed to save");
    expect(FEEDBACK_DURATIONS.error).toBeGreaterThan(
      FEEDBACK_DURATIONS.success,
    );

    vi.advanceTimersByTime(FEEDBACK_DURATIONS.error + 10);
    expect(list()).toHaveLength(0);
  });

  it("gives a warning the same courtesy", () => {
    notify.warning("Some rows were skipped");
    vi.advanceTimersByTime(FEEDBACK_DURATIONS.warning + 10);
    expect(list()).toHaveLength(0);
  });

  it("still holds a failure open long enough to be read and acted on", () => {
    // The reason for the longer window: a user who glances up mid-task and
    // looks back must still find it there.
    notify.error("Failed to save");
    vi.advanceTimersByTime(FEEDBACK_DURATIONS.success);
    expect(list()).toHaveLength(1);
  });

  it("never clears a loading toast on its own", () => {
    // Loading is the one variant that stays. It is an in-flight state, not a
    // message — `notify.promise` rewrites the same card into its outcome, and
    // a spinner that vanished mid-request would strand the user.
    notify.loading("Saving…");
    vi.advanceTimersByTime(60_000);
    expect(list()).toHaveLength(1);
  });

  it("pauses while the user is reading and resumes with the time it had left", () => {
    notify.success("Saved");
    const id = list()[0].id;

    vi.advanceTimersByTime(2000);
    pause(id);
    const held = getProgress(id);

    // Hovering for ten seconds must not cost the user the remaining time.
    vi.advanceTimersByTime(10_000);
    expect(getProgress(id)).toBeCloseTo(held, 5);
    expect(list()).toHaveLength(1);

    resume(id);
    vi.advanceTimersByTime(FEEDBACK_DURATIONS.success);
    expect(list()).toHaveLength(0);
  });
});

describe("notify — promise", () => {
  it("reports the outcome only once the server has committed", async () => {
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });

    const done = notify.promise(pending, {
      loading: "Saving…",
      success: "Saved",
      error: "Not saved",
    });

    // Still in flight: the only thing on screen is the working state. There is
    // no code path here that can report a success the server has not granted.
    expect(list().map((t) => t.variant)).toEqual(["loading"]);

    resolve("ok");
    await done;

    const visible = list();
    expect(visible).toHaveLength(1);
    expect(visible[0].variant).toBe("success");
    expect(visible[0].title).toBe("Saved");
  });

  it("turns the same card into a failure when the promise rejects", async () => {
    await expect(
      notify.promise(Promise.reject(new Error("409")), {
        loading: "Saving…",
        success: "Saved",
        error: "Not saved",
      }),
    ).rejects.toThrow();

    const visible = list();
    expect(visible).toHaveLength(1);
    expect(visible[0].variant).toBe("error");
    // A failure must not inherit a loading toast's timer — it gets its own,
    // longer one.
    expect(visible[0].duration ?? FEEDBACK_DURATIONS.error).toBe(
      FEEDBACK_DURATIONS.error,
    );
  });

  it("gives the handlers the resolved value and the rejection reason", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    await notify.promise(Promise.resolve({ id: 7 }), {
      loading: "Saving…",
      success: (value) => `Saved ${value.id}`,
      error: "No",
      onSuccess,
    });
    expect(onSuccess).toHaveBeenCalledWith({ id: 7 });
    // The first outcome is still on screen — its four seconds have not run —
    // so the second promise adds a card beside it rather than replacing it.
    expect(list().map((t) => t.title)).toEqual(["Saved 7"]);

    await expect(
      notify.promise(Promise.reject("nope"), {
        loading: "Saving…",
        success: "Saved",
        error: (reason) => `Failed: ${reason}`,
        onError,
      }),
    ).rejects.toBeTruthy();
    expect(onError).toHaveBeenCalledWith("nope");
    expect(list().map((t) => t.title)).toEqual(["Saved 7", "Failed: nope"]);
  });
});

describe("notify — catalog operations", () => {
  it("takes its wording from i18n, not from the call site", () => {
    notify.operation("saved", { values: { entity: "Settings" } });
    expect(list()[0].title).toBe("Saved");
    expect(list()[0].description).toBe("Settings were saved.");
  });

  it("renders the same operation in the user's language", () => {
    setLocale("am");
    notify.operation("saved", { values: { entity: "ቅንብሮች" } });

    expect(list()[0].title).toBe("ተቀምጧል");
    expect(list()[0].description).toContain("ተቀምጧል");
  });

  it("carries the catalog's icon and weight, not the caller's", () => {
    notify.operation("allocationApproved", {
      values: {
        name: "Aster Bekele",
        employeeNumber: "EMP-0042",
        houseNumber: "B-202",
      },
    });

    const toast = list()[0];
    expect(toast.variant).toBe("success");
    expect(toast.title).toBe("House allocation approved");
    expect(toast.description).toBe(
      "Aster Bekele (EMP-0042) was allocated house B-202.",
    );
  });

  it("renders an allocated confirmation in Amharic", () => {
    setLocale("am");
    notify.operation("allocationApproved", {
      values: {
        name: "አስተሮር",
        employeeNumber: "EMP-0042",
        houseNumber: "B-202",
      },
    });
    expect(list()[0].title).toBe("የቤት ምደባ ተጸድቷል");
  });

  it("reads as info, not success, when nothing has been committed yet", () => {
    // Releasing records the reason branch and writes no ledger state; a green
    // card there would overstate what just happened.
    notify.operation("releaseInitiated", {
      values: { name: "Aster", employeeNumber: "EMP-1", branch: "Retirement" },
    });
    expect(list()[0].variant).toBe("info");
  });
});

describe("notify — dismissal", () => {
  it("clear() removes everything and cancels every timer", () => {
    notify.success("One");
    notify.error("Two");
    notify.clear();

    expect(list()).toHaveLength(0);
    // No orphaned timer may fire afterwards and touch a stale id.
    vi.advanceTimersByTime(60_000);
    expect(list()).toHaveLength(0);
  });

  it("ignores a dismiss for an id that is already gone", () => {
    const id = notify.success("One");
    notify.dismiss(id);
    expect(() => notify.dismiss(id)).not.toThrow();
    expect(list()).toHaveLength(0);
  });
});
