// Every item once per shuffled cycle; no immediate repeat at cycle boundaries.
export function createShuffleBag(items,random=Math.random){
  if(!Array.isArray(items)||!items.length)throw new Error('Empty shuffle bag');
  const source=[...items];let bag=[],last;
  return {next(){if(!bag.length){bag=[...source];for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag.length>1&&bag[bag.length-1]===last)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];}last=bag.pop();return last;}};
}
