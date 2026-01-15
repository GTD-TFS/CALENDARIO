// auth.js — login mínimo (usuario corto O email) + nombre visible
(()=>{

const USERS = {
  javi:   { email: "javier@calendario.local", name: "Javi"   },
  jose:   { email: "jose@calendario.local",   name: "Jose"   }, // ADMIN
  tamara: { email: "tamara@calendario.local", name: "Tamara" },
  david:  { email: "david@calendario.local",  name: "David"  },
  sara:   { email: "sara@calendario.local",   name: "Sara"   },
  tere:   { email: "tere@calendario.local",   name: "Tere"   }
};

  function norm(s){ return String(s||"").trim().toLowerCase(); }

  function toEmail(userOrEmail){
    const s = norm(userOrEmail);
    if (!s) return "";
    if (s.includes("@")) return s;
    return USERS[s]?.email || "";
  }

  function nameFor(userOrEmail, firebaseUser){
    const s = norm(userOrEmail);
    if (s && USERS[s]?.name) return USERS[s].name;

    const email = norm(firebaseUser?.email);
    if (email){
      for (const k in USERS){
        if (USERS[k].email === email) return USERS[k].name;
      }
    }
    return "Usuario";
  }

  async function login(userOrEmail, password){
    const email = toEmail(userOrEmail);
    if (!email) throw new Error("Usuario no existe");
    return fbAuth.signInWithEmailAndPassword(email, password);
  }

  async function logout(){
    return fbAuth.signOut();
  }

  function current(){
    return fbAuth.currentUser;
  }

  window.Auth = { login, logout, current, nameFor };

})();