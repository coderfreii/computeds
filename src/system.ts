import type { Dep } from './dep';
import type { Tracker, TrackToken } from './tracker';

export const enum DirtyLevels {
	NotDirty = 0,
	ComputedValueMaybeDirty = 1,
	ComputedValueDirty = 2,
	Dirty = 3
}

let _activeTrackersInCurrentCallStack: Tracker[] = [];

let pauseEffectStack = 0;

const pausedTrackers: Tracker[][] = [];
const _pausedEffects: Tracker[] = [];


const pausedEffects = {
	push(item: Tracker) {
		return _pausedEffects.push(item);
	},
	pop() {
		return _pausedEffects.pop();
	},
	get length(){
		return _pausedEffects.length
	},
	shift(){
		return _pausedEffects.shift()
	}
}


export const activeTrackersInCurrentCallStack = {
	push(item: Tracker) {
		return _activeTrackersInCurrentCallStack.push(item);
	},
	pop() {
		return _activeTrackersInCurrentCallStack.pop();
	},
	shift(){
		return _activeTrackersInCurrentCallStack.shift()
	},
	get length(){
		return _activeTrackersInCurrentCallStack.length
	},
}

export function pauseTracking() {
	pausedTrackers.push(_activeTrackersInCurrentCallStack);
	_activeTrackersInCurrentCallStack = [];
}

export function resetTracking() {
	_activeTrackersInCurrentCallStack = pausedTrackers.pop()!;
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

export const outerTrackerDepsMap = new WeakMap<TrackToken, Dep[]>();

const trackerRegistry = new FinalizationRegistry<WeakRef<Tracker>>(trackToken => {
	const deps = outerTrackerDepsMap.get(trackToken);
	if (deps) {
		for (const dep of deps) {
			dep.delete(trackToken);
		}
		deps.length = 0;
	}
});


function getCurrentOuterTracker() {
	if (_activeTrackersInCurrentCallStack.length) {
		const tracker = _activeTrackersInCurrentCallStack[_activeTrackersInCurrentCallStack.length - 1];
		if (!tracker.trackToken) {
			if (tracker.effect) {
				tracker.trackToken = tracker;
			} else {
				tracker.trackToken = new WeakRef(tracker);
				trackerRegistry.register(tracker, tracker.trackToken, tracker);
			}
			outerTrackerDepsMap.set(tracker.trackToken, []);
		}

		return tracker;
	}
}


export function collectOuterTrackerContext(outerTrackers: Dep) {  
	const outerTracker = getCurrentOuterTracker();
	if (outerTracker && outerTracker.trackToken) {
		//
		const trackToken = outerTracker.trackToken;
		const outerTrackerDeps = outerTrackerDepsMap.get(trackToken);  //获取当前激活的outerTracker的所有的下游依赖
		if (outerTrackerDeps) {
			if (outerTrackers.get(outerTracker) !== outerTracker.activeNo) {    //computed第一次check是否放入, 放入后每次check  outerTracker的aactive的次数是否匹配 不匹配才能进入
				outerTrackers.set(outerTracker, outerTracker.activeNo);  

				const oldDep = outerTrackerDeps[outerTracker.depsLength];  //取最新一个依赖 跟当前不相等
				if (oldDep !== outerTrackers) {
					if (oldDep) {
						cleanupDepEffect(oldDep, outerTracker);
					}
					outerTrackerDeps[outerTracker.depsLength++] = outerTrackers;   //放入outerTracker.depsLength的位置
				} else {
					outerTracker.depsLength++;
				}
			}
		}
	}
}


export function cleanupDepEffect(dep: Dep, tracker: Tracker) {
	const trackId = dep.get(tracker);
	if (trackId !== undefined && tracker.activeNo !== trackId) {
		dep.delete(tracker);
	}
}

export function trigger(outerTrackers: Dep, expectDirtyLevel: DirtyLevels) {
	pauseEffect();
	for (const outerTrackToken of outerTrackers.keys()) {
		const outerTracker = outerTrackToken.deref();
		if (!outerTracker) {
			continue;
		}
		if (
			outerTracker.dirtyLevel < expectDirtyLevel &&    //expectDirtyLevel need be dirty more than before the tracker was 
			(!outerTracker.runnings || expectDirtyLevel !== DirtyLevels.ComputedValueDirty)
		) {
			const lastDirtyLevel = outerTracker.dirtyLevel;
			outerTracker.setDirtyLevel(expectDirtyLevel);
			if (
				lastDirtyLevel === DirtyLevels.NotDirty &&   //if the tracker was NotDirty
				(!outerTracker.queryings || expectDirtyLevel !== DirtyLevels.ComputedValueDirty)
			) {
				outerTracker.spread();
				if (outerTracker.effect) {
					pausedEffects.push(outerTracker);
				}
			}
		}
	}
	resetEffect();
}
