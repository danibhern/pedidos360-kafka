export const environment = {
  reportApi:
    import.meta.env.VITE_REPORT_API ||
    'http://localhost:3001/api/report',

  auditApi:
    import.meta.env.VITE_AUDIT_API ||
    'http://localhost:3002/api/audit',
};