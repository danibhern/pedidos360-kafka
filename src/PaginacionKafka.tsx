export function PaginacionKafka({ page, total, size, onPage }: {
  page: number; total: number; size: number; onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav className="kv-pagination" aria-label="Paginación de resultados">
    <button className="btn" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>Página {page + 1} de {pages} · {total} registros</span>
    <button className="btn" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Siguiente</button>
  </nav>;
}
