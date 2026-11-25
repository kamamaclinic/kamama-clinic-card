export function cardNotificationNotice(result) {
  if (result?.reason === 'disabled') return '';
  if (result?.status === 'sent') return 'הודעת המייל נשלחה.';
  if (result?.reason === 'missing_email') return 'לא נשלחה הודעת מייל: לא הוגדרה כתובת אימייל.';
  return 'הודעה מסוג זה כבר נשלחה.';
}
export function isTransientCardNotice(message) {
  return message === 'הודעת המייל נשלחה.' || message === 'הודעה מסוג זה כבר נשלחה.';
}
