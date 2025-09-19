// eslint-disable
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';

const en_nocheckpoints_title1 = /** @type {(inputs: {}) => string} */ () => {
	return `No Checkpoint Models Found`
};

const ko_nocheckpoints_title1 = /** @type {(inputs: {}) => string} */ () => {
	return `체크포인트 모델을 찾을 수 없습니다`
};

/**
* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
*
* - Changing this function will be over-written by the next build.
*
* - If you want to change the translations, you can either edit the source files e.g. `en.json`, or
* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
* 
* @param {{}} inputs
* @param {{ locale?: "en" | "ko" }} options
* @returns {string}
*/
/* @__NO_SIDE_EFFECTS__ */
const nocheckpoints_title1 = (inputs = {}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.nocheckpoints_title1(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("nocheckpoints_title1", locale)
	if (locale === "en") return en_nocheckpoints_title1(inputs)
	return ko_nocheckpoints_title1(inputs)
};
export { nocheckpoints_title1 as "noCheckpoints.title" }