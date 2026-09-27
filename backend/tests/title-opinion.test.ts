import {describe,it,expect} from "vitest";
import {titleOpinionAction} from "../src/services/title-opinion.js";
describe("independent Chat viewing and opinion",()=>{
  for(const [message,seen,reaction] of [
    ["I watched the first one and liked it",true,"like"],
    ["I have seen the second one, meh",true,"meh"],
    ["I watched the first one but did not like it",true,"dislike"],
    ["I liked the second one",undefined,"like"],
    ["Mark the first one seen",true,undefined],
    ["I haven't seen the first one",undefined,undefined],
    ["Remove the seen mark from the first one",false,undefined],
    ["Clear the second one's opinion",undefined,null],
  ] as const)it(message,()=>expect(titleOpinionAction(message)).toEqual({seen,reaction}));
});
