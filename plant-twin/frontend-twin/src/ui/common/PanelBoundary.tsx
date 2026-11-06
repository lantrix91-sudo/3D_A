import { Component, type ReactNode } from 'react';

/**
 * Ошибка внутри одной панели не должна «ронять» всё приложение в белый экран:
 * панель показывает текст ошибки и кнопку «Продолжить», остальное продолжает работать.
 */
export class PanelBoundary extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  componentDidCatch(e: unknown, info: { componentStack?: string | null }) {
    console.error(`[${this.props.name}] ошибка отображения`, e, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel panel-error" role="alert">
        <b>Не удалось показать: {this.props.name}</b>
        <p>Остальная часть приложения работает. Сообщите разработчику текст ниже.</p>
        <code>{this.state.error}</code>
        <div className="panel-error__row">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => this.setState({ error: null })}>Продолжить</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => location.reload()}>Перезагрузить страницу</button>
        </div>
      </div>
    );
  }
}
