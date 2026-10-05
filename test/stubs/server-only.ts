// Remplace le paquet `server-only` pendant les tests : il refuse d'être importé
// hors d'un contexte serveur React, ce qui bloquerait les tests de lib/repo.
export {}
