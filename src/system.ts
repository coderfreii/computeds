import type { Dep } from './dep';
import type { Tracker, TrackToken } from './tracker';

export const enum DirtyLevels {
	NotDirty = 0,
	ComputedValueMaybeDirty = 1,
	ComputedValueDirty = 2,
	Dirty = 3
}

export let activeTrackers: Tracker[] = [];

let pauseEffectStack = 0;

const pausedTrackers: Tracker[][] = [];
const pausedEffects: Tracker[] = [];

export function pauseTracking() {
	pausedTrackers.push(activeTrackers);
	activeTrackers = [];
}

export function resetTracking() {
	activeTrackers = pausedTrackers.pop()!;
}

export function pauseEffect() {
	pauseEffectStack++;
}

export function resetEffect() {
	pauseEffectStack--;
	while (!pauseEffectStack && pausedEffects.length) {
		pausedEffects.shift()!.effect!();
	}
}

export const depsMap = new WeakMap<TrackToken, Dep[]>();

const trackerRegistry = new FinalizationRegistry<WeakRef<Tracker>>(trackToken => {
	const deps = depsMap.get(trackToken);
	if (deps) {
		for (const dep of deps) {
			dep.delete(trackToken);
		}
		deps.length = 0;
	}
});

export function track(dep: Dep) {
	if (activeTrackers.length) {
		const tracker = activeTrackers[activeTrackers.length - 1];
		if (!tracker.trackToken) {
			if (tracker.effect) {
				tracker.trackToken = tracker;
			} else {
				tracker.trackToken = new WeakRef(tracker);
				trackerRegistry.register(tracker, tracker.trackToken, tracker);
			}
			depsMap.set(tracker.trackToken, []);
		}
		const trackToken = tracker.trackToken;
		const deps = depsMap.get(trackToken);
		if (deps) {
			if (dep.get(tracker) !== tracker.trackId) {
				dep.set(tracker, tracker.trackId);
				const oldDep = deps[tracker.depsLength];
				if (oldDep !== dep) {
					if (oldDep) {
						cleanupDepEffect(oldDep, tracker);
					}
					deps[tracker.depsLength++] = dep;
				} else {
					tracker.depsLength++;
				}
			}
		}
	}
}

export function cleanupDepEffect(dep: Dep, tracker: Tracker) {
	const trackId = dep.get(tracker);
	if (trackId !== undefined && tracker.trackId !== trackId) {
		dep.delete(tracker);
	}
}

export function trigger(dep: Dep, dirtyLevel: DirtyLevels) {
	pauseEffect();
	for (const trackToken of dep.keys()) {
		const tracker = trackToken.deref();
		if (!tracker) {
			continue;
		}
		if (
			tracker.dirtyLevel < dirtyLevel &&
			(!tracker.runnings || dirtyLevel !== DirtyLevels.ComputedValueDirty)
		) {
			const lastDirtyLevel = tracker.dirtyLevel;
			tracker.dirtyLevel = dirtyLevel;
			if (
				lastDirtyLevel === DirtyLevels.NotDirty &&
				(!tracker.queryings || dirtyLevel !== DirtyLevels.ComputedValueDirty)
			) {
				tracker.spread();
				if (tracker.effect) {
					pausedEffects.push(tracker);
				}
			}
		}
	}
	resetEffect();
}
