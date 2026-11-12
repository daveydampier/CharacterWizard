import { routeHref } from '../router';

export function AboutScreen() {
  return (
    <main className="mx-auto max-w-md p-4">
      <a href={routeHref({ name: 'home' })} className="inline-flex min-h-11 items-center text-sm text-indigo-700">‹ Characters</a>
      <h1 className="mt-2 text-xl font-semibold">About Character Wizard</h1>
      <p className="mt-3 text-sm">
        A play aid for D&D (2024 rules). It shows what your character can do, grouped by Action, Bonus Action
        and Reaction, with every roll written out.
      </p>
      <h2 className="mt-5 font-medium">Licensing and attribution</h2>
      <p className="mt-2 text-sm">
        This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast
        LLC, available at{' '}
        <a href="https://www.dndbeyond.com/srd" className="text-indigo-700 underline">https://www.dndbeyond.com/srd</a>.
        The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode" className="text-indigo-700 underline">
          https://creativecommons.org/licenses/by/4.0/legalcode
        </a>.
      </p>
      <p className="mt-3 text-sm">
        Character Wizard is not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast.
      </p>
      <h2 className="mt-5 font-medium">Your data</h2>
      <p className="mt-2 text-sm">
        Your characters and what you have spent are stored on this device only. Ability descriptions come from
        your own imported sheet.
      </p>
    </main>
  );
}
