export type PracticeRecord={score:number;accuracy:number;timeMs:number;summary:string;attempts:number;recentAccuracy:number[]};
export function updatePracticeRecord(previous:PracticeRecord|null,next:{score:number;accuracy:number;timeMs:number;summary:string}){
 const improved=!previous||next.score>previous.score||(next.score===previous.score&&next.accuracy>previous.accuracy)||(next.score===previous.score&&next.accuracy===previous.accuracy&&next.timeMs<previous.timeMs);
 const best=improved?next:previous;
 return {improved,record:{...best,attempts:(previous?.attempts??0)+1,recentAccuracy:[...(previous?.recentAccuracy??[]),next.accuracy].slice(-10)} as PracticeRecord};
}
export function masteryLevel(accuracy:number,count:number){
 if(count<5)return "Learning";
 return accuracy>=.9?"Expert":accuracy>=.75?"Advanced":accuracy>=.5?"Developing":"Learning";
}
