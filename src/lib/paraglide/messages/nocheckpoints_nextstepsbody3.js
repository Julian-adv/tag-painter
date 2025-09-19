// eslint-disable
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';

const en_nocheckpoints_nextstepsbody3 = /** @type {(inputs: {}) => string} */ () => {
	return `After downloading a model file, place it in the checkpoints folder and click the refresh button (🔄) to reload the model list.`
};

const ko_nocheckpoints_nextstepsbody3 = /** @type {(inputs: {}) => string} */ () => {
	return `모델 파일을 다운로드한 뒤 체크포인트 폴더에 넣고 새로 고침 버튼(🔄)을 눌러 모델 목록을 다시 불러오세요.`
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
const nocheckpoints_nextstepsbody3 = (inputs = {}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.nocheckpoints_nextstepsbody3(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("nocheckpoints_nextstepsbody3", locale)
	if (locale === "en") return en_nocheckpoints_nextstepsbody3(inputs)
	return ko_nocheckpoints_nextstepsbody3(inputs)
};
export { nocheckpoints_nextstepsbody3 as "noCheckpoints.nextStepsBody" }