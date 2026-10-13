// Work-conserving concurrency: a free slot starts the next task immediately,
// instead of waiting for the slowest member of a fixed-size group.
export async function boundedSettled<T,R>(items:T[],limit:number,run:(item:T)=>Promise<R>):Promise<PromiseSettledResult<R>[]> {
  const results:PromiseSettledResult<R>[]=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},async()=>{
    for(let index=cursor++;index<items.length;index=cursor++){
      try{results[index]={status:'fulfilled',value:await run(items[index]!)};}
      catch(reason){results[index]={status:'rejected',reason};}
    }
  }));
  return results;
}
