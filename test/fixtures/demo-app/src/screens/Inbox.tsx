import { t } from '../i18n';

export function Inbox({ messages }: { messages: string[] }) {
  if (!messages.length) {
    return (
      <section>
        <h2>{t('inbox.empty.title')}</h2>
        <p>{t('inbox.empty.body')}</p>
        <button>{t('inbox.empty.cta')}</button>
        <button>Cancel</button>
      </section>
    );
  }
  return <ul>{messages.map((m) => <li key={m}>{m}</li>)}</ul>;
}
