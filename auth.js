// auth.js — login mínimo (email + password)
(()=>{

  async function login(email, password){
    email = String(email || "").trim();
    if (!email.includes("@")) throw new Error("Escribe el email (no alias)");
    return fbAuth.signInWithEmailAndPassword(email, password);
  }

  async function logout(){
    return fbAuth.signOut();
  }

  function current(){
    return fbAuth.currentUser;
  }

  window.Auth = { login, logout, current };

})();
