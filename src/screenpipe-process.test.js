import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { processusEnVie, arreterScreenpipe } from './screenpipe-process.js';

test('arreterScreenpipe arrête le chef de groupe et ses enfants', async () => {
  // Simule `npx` : un chef de groupe détaché qui a deux enfants.
  const chef = spawn('sh', ['-c', 'sleep 60 & sleep 60 & wait'], { detached: true, stdio: 'ignore' });
  chef.unref();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(processusEnVie(chef.pid), true);

  await arreterScreenpipe(chef.pid);

  assert.equal(processusEnVie(chef.pid), false);
});

test('arreterScreenpipe ne plante pas sur un groupe déjà arrêté', async () => {
  const chef = spawn('sh', ['-c', 'exit 0'], { detached: true, stdio: 'ignore' });
  await new Promise(resolve => chef.on('exit', resolve));
  await arreterScreenpipe(chef.pid);
});
