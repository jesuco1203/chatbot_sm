import assert from 'assert';
import { searchMenu } from './productSearch';
import { MenuItem } from '../data/menu';
import { setMenuCacheForTests } from './menuCache';

const stubMenu: MenuItem[] = [
  {
    id: 'lasagna_alfredo',
    name: 'Lasagna Alfredo',
    description: 'Clásica lasaña con salsa Alfredo',
    category: 'lasagna',
    prices: { solo: 21 },
    keywords: ['lasaña', 'alfredo']
  },
  {
    id: 'pizza_pepperoni',
    name: 'Pizza Pepperoni',
    description: 'Clásica con pepperoni',
    category: 'pizza',
    prices: { familiar: 35 },
    keywords: ['pepperoni']
  }
];

const resetMenu = () => {
  setMenuCacheForTests(stubMenu);
};

const assertSingleResult = async (query: string, expectedId: string) => {
  const results = await searchMenu({ query });
  assert.strictEqual(results.length, 1, `Esperaba 1 resultado para '${query}', obtuve ${results.length}`);
  assert.strictEqual(results[0]?.id, expectedId, `Resultado inesperado para '${query}'`);
};

const run = async () => {
  resetMenu();

  await assertSingleResult('lasaña alfredo', 'lasagna_alfredo');
  await assertSingleResult('lasagna alfredo', 'lasagna_alfredo');
  await assertSingleResult('una lasaña alfredo', 'lasagna_alfredo');
  await assertSingleResult('una lasana alfredo', 'lasagna_alfredo');

  console.log('✅ Tests de búsqueda de lasaña Alfredo pasaron');
};

run();
