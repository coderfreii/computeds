import type { TrackToken } from './tracker';

export class Dep extends Map<TrackToken, number>  {
	constructor(public computed?: () => void) {
		super();
	}
}
