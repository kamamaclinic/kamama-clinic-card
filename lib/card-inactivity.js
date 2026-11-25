const CLINIC_TIME_ZONE = "Asia/Jerusalem";

function clinicDate(value = new Date()) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE, year:"numeric",month:"2-digit",day:"2-digit"
  }).format(date);
}
function addCalendarMonths(date, months) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return "";
  const [year,month,day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year,month-1+months,1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,lastDay));
  return target.toISOString().slice(0,10);
}
function inactivityMonths(value) {
  const number=Number(value);
  return Number.isInteger(number) && number>=1 && number<=24 ? number : 2;
}
function inactivityReminder(card, transaction, months, today=clinicDate()) {
  const remaining=Math.max(0,Number(card.total_minutes || 0)-Number(card.used_minutes || 0));
  if (card.archived_at || !Number.isFinite(remaining) || remaining<=0 || !card.expires_at || card.expires_at<today) return null;
  if (!transaction?.id || transaction.client_id!==card.id || !Number.isFinite(Number(transaction.minutes)) || Number(transaction.minutes)>=0) return null;
  const lastTreatmentDate=clinicDate(transaction.created_at);
  if (!lastTreatmentDate || lastTreatmentDate>today) return null;
  // A newly purchased/renewed card gets the same waiting period before a reminder.
  // Loading minutes or a zero-minute expiry record is never treated as a visit.
  const anchors=[lastTreatmentDate];
  if (card.purchased_at && /^\d{4}-\d{2}-\d{2}$/.test(card.purchased_at)) anchors.push(card.purchased_at);
  if (card.current_cycle_started_at) {
    const cycleDate=clinicDate(card.current_cycle_started_at);
    if (cycleDate) anchors.push(cycleDate);
  }
  const anchor=anchors.sort().at(-1);
  const dueDate=addCalendarMonths(anchor,inactivityMonths(months));
  if (!dueDate || today<dueDate) return null;
  const cycle=card.current_cycle_started_at || card.purchased_at || "initial";
  return {dueDate,lastTreatmentDate,dedupeKey:"card:"+card.id+":inactivity:"+cycle+":"+transaction.id};
}
module.exports={clinicDate,addCalendarMonths,inactivityMonths,inactivityReminder};
