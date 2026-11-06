// Экран «Выбор маршрута»: активные маршруты крупными карточками. Маршрутов нет — обход всего цеха.
import { button, element, syncLine, topBar } from '../ui.js';

export function renderRoutes(root, ctx) {
  function render() {
    const { state } = ctx;
    const menu = button('⚙', 'top-action', ctx.openSettings);
    menu.setAttribute('aria-label', 'Настройки');
    const logout = button('Выйти', 'top-action', ctx.logout);
    root.replaceChildren(topBar({ title: 'Маршруты', subtitle: ctx.userLine(), actions: [menu, logout] }));
    const body = element('main', 'screen-body');
    body.append(syncLine(state));
    const routes = state.routes.filter((route) => route.is_active);
    const list = element('ol', 'route-cards');
    const card = (title, detail, routeId) => {
      const item = element('li');
      const open = button('', `route-card${routeId === state.routeId ? ' current' : ''}`, () => ctx.openRoute(routeId));
      open.append(element('strong', '', title), element('small', '', detail));
      item.append(open);
      return item;
    };
    if (routes.length) list.append(...routes.map((route) => card(route.name, `${route.stops.length} шаг.`, route.id)));
    else if (state.loaded) list.append(card('Всё оборудование', 'Маршрутов нет — обход всего цеха', null));
    if (!state.loaded) body.append(element('p', 'muted', 'Загрузка маршрутов…'));
    body.append(list, button('Обновить', 'big secondary', ctx.reload));
    root.append(body);
  }
  render();
  return { update: render };
}
