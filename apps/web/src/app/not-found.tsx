import Link from 'next/link';
import en from '../../messages/en.json';
export default function NotFound() {
  return (
    <main className="wrap empty-state" id="main">
      <p className="kicker">Stella Sharm Tours</p>
      <h1>{en.notFound}</h1>
      <Link href="/en" className="button ink">
        {en.home}
      </Link>
    </main>
  );
}
