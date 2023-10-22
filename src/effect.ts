import { Tracker } from './tracker';

export function effect(fn: () => void): Tracker {

	const tracker = new Tracker(
		() => { },
		() => {
			if (tracker.dirty) {
				tracker.track(fn);
			}
		});
	tracker.track(fn);

	return tracker;
}
