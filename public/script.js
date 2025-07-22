const socket = io();
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const userList = document.getElementById("userList");
const roomTitle = document.getElementById("roomTitle");
const showUsersBtn = document.getElementById("showUsersBtn");

// Modal elements
const userModal = document.getElementById("userModal");
const userForm = document.getElementById("userForm");
const nicknameInput = document.getElementById("nicknameInput");
const ageInput = document.getElementById("ageInput");

// All users modal (for mobile)
const allUsersModal = document.getElementById("allUsersModal");
const allUsersList = document.getElementById("allUsersList");
let latestUsers = [];
let unreadPrivate = {}; // Track unread private messages

let currentRoom = "public";
let myId = null;
let myGender = "male";
let myNickname = "";
let myAge = null;

// Function to scroll chat messages to the bottom
function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// Show modal and handle form for user info
function showUserModal() {
  userModal.style.display = "flex";
  nicknameInput.focus();

  userForm.onsubmit = function (e) {
    e.preventDefault();
    const nickname = nicknameInput.value.trim();
    const gender = userForm.gender.value;
    const age = ageInput.value.trim();

    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    if (!age || isNaN(age) || age < 18 || age > 99) {
      ageInput.focus();
      ageInput.style.borderColor = "#e75480";
      return;
    }

    myGender = gender;
    myNickname = nickname;
    myAge = age;

    // Emit user info to the server
    socket.emit("user info", { nickname, gender, age });

    // Hide the modal immediately after valid submission
    userModal.style.display = "none";

    // Join public room after user info is sent.
    // The server will handle sending "nickname taken" if necessary.
    socket.emit("join room", "public");

    // Optional: Focus input after modal close
    setTimeout(() => input.focus(), 100);
  };
}

// Handle nickname taken error from server
socket.on("nickname taken", () => {
  userModal.style.display = "flex"; // Re-open modal
  nicknameInput.style.borderColor = "#e11d48";
  nicknameInput.value = "";
  nicknameInput.placeholder = "Nickname already taken! Try another.";
  nicknameInput.focus();
});

// On successful connection to Socket.IO
socket.on("connect", () => {
  myId = socket.id;
  showUserModal(); // Always show user modal on connect
});

// Handle chat message submission
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (input.value) {
    socket.emit("chat message", { room: currentRoom, text: input.value });
    input.value = "";
    // No need for immediate scroll here; addMessage will handle it.
    // Also, focusing input again helps mobile keyboard stay open.
    setTimeout(() => input.focus(), 10);
  }
});

// Scroll to bottom when input is focused (useful for mobile keyboard)
input.addEventListener("focus", () => {
  setTimeout(() => {
    scrollToBottom();
  }, 100);
});

// Helper functions for gender symbols and colors
function getGenderSymbol(gender) {
  return gender === "female" ? "♀" : "♂";
}
function getNameColor(gender) {
  return gender === "female" ? "#e75480" : "#3b82f6";
}

// Add message to the chat display
function addMessage(msg) {
  const item = document.createElement("div");
  item.classList.add("msg");
  if (msg.id && msg.id === myId) {
    item.classList.add("me");
  } else {
    item.classList.add("other");
  }
  item.innerHTML = `
    <div class="bubble">
      <span style="color:${getNameColor(msg.gender)};font-weight:600;">
        ${msg.name} ${getGenderSymbol(msg.gender)}${
    msg.age ? " · " + msg.age : ""
  }:</span> ${msg.text}
    </div>
  `;
  messages.appendChild(item);
  scrollToBottom(); // Scroll to bottom after adding each message
}

// Main message handler
socket.on("chat message", (msg) => {
  // If it's a private message for me, and I'm not in that room, mark as unread
  if (
    msg.room !== "public" &&
    currentRoom !== msg.room &&
    msg.to === myId // Only mark as unread if I'm the recipient
  ) {
    const otherId = msg.id;
    unreadPrivate[otherId] = true;
    updateUserList(); // Update UI to show red dot
  }

  // If the message is for the current room, display it
  if (msg.room === currentRoom) {
    addMessage(msg);
    // If in a private room, clear unread status for that user
    if (msg.room !== "public") {
      const otherId = msg.id === myId ? msg.to : msg.id; // Get the ID of the other person in the private chat
      if (unreadPrivate[otherId]) { // Only clear if it was actually marked unread
          unreadPrivate[otherId] = false;
          updateUserList(); // Update UI to remove red dot
      }
    }
  }
});

// When joining a room, load its history
socket.on("room history", (msgs) => {
  messages.innerHTML = ""; // Clear existing messages
  msgs.forEach(addMessage); // Add new messages from history
  scrollToBottom(); // Scroll to bottom after history is loaded
});

// Update the list of online users
function updateUserList() {
  userList.innerHTML = "";

  // Public room button in sidebar
  const publicBtn = document.createElement("div");
  publicBtn.className = "user";
  publicBtn.textContent = "🌐 Public Room";
  publicBtn.onclick = () => {
    if (currentRoom !== "public") { // Prevent unnecessary re-joins
      currentRoom = "public";
      roomTitle.textContent = "🌐 Public Chat";
      messages.innerHTML = ""; // Clear messages immediately for visual feedback
      socket.emit("join room", currentRoom);
      setTimeout(scrollToBottom, 50); // Small delay to ensure render before scroll
    }
  };
  userList.appendChild(publicBtn);

  // Add individual users to the list
  latestUsers.forEach((user) => {
    if (user.id === myId) return; // Don't list myself
    const div = document.createElement("div");
    div.className = "user";
    div.innerHTML =
      `<span style="color:${getNameColor(user.gender)};font-weight:600;">
      ${user.name} ${getGenderSymbol(user.gender)}${
        user.age ? " · " + user.age : ""
      }</span>` +
      (unreadPrivate[user.id] ? '<span class="red-dot"></span>' : "");
    div.onclick = () => {
      const newRoom = [myId, user.id].sort().join("-");
      if (currentRoom !== newRoom) { // Prevent unnecessary re-joins
        currentRoom = newRoom;
        roomTitle.textContent = `🔒 Chat with ${user.name}`;
        messages.innerHTML = ""; // Clear messages immediately for visual feedback
        socket.emit("join room", currentRoom);
        // Clear unread dot immediately on click
        unreadPrivate[user.id] = false;
        updateUserList(); // Re-render to remove red dot
        setTimeout(scrollToBottom, 50); // Small delay
      }
    };
    userList.appendChild(div);
  });
}

// When server sends an updated user list
socket.on("user list", (users) => {
  latestUsers = users;
  updateUserList(); // Refresh the displayed user list
});

// Show online users modal when clicking "Users" button (mobile only)
showUsersBtn.onclick = () => {
  if (window.innerWidth <= 768) {
    allUsersList.innerHTML = "";

    // Public Room button in the mobile modal
    const publicBtn = document.createElement("div");
    publicBtn.className = "user";
    publicBtn.style =
      "background:#eef;padding:10px;border-radius:6px;margin-bottom:8px;cursor:pointer;text-align:center;";
    publicBtn.textContent = "🌐 Public Room";
    publicBtn.onclick = () => {
      if (currentRoom !== "public") {
        currentRoom = "public";
        roomTitle.textContent = "🌐 Public Chat";
        messages.innerHTML = "";
        socket.emit("join room", currentRoom);
      }
      allUsersModal.style.display = "none";
      setTimeout(scrollToBottom, 50);
    };
    allUsersList.appendChild(publicBtn);

    const countDiv = document.createElement("div");
    countDiv.style =
      "text-align:center;margin-bottom:8px;color:#4f46e5;font-weight:600;";
    countDiv.textContent = `Online Users: ${latestUsers.length}`;
    allUsersList.appendChild(countDiv);

    // Add individual users to the mobile modal list
    latestUsers.forEach((user) => {
      if (user.id === myId) return;
      const div = document.createElement("div");
      div.className = "user";
      div.innerHTML =
        `<span style="color:${getNameColor(user.gender)};font-weight:600;">
        ${user.name} ${getGenderSymbol(user.gender)}${
          user.age ? " · " + user.age : ""
        }</span>` +
        (unreadPrivate[user.id] ? '<span class="red-dot"></span>' : "");
      div.onclick = () => {
        const newRoom = [myId, user.id].sort().join("-");
        if (currentRoom !== newRoom) {
          currentRoom = newRoom;
          roomTitle.textContent = `🔒 Chat with ${user.name}`;
          messages.innerHTML = "";
          socket.emit("join room", currentRoom);
          unreadPrivate[user.id] = false;
          updateUserList();
        }
        allUsersModal.style.display = "none";
        setTimeout(scrollToBottom, 50);
      };
      allUsersList.appendChild(div);
    });
    allUsersModal.style.display = "flex";
  }
};

// Hide all users modal when clicking outside (optional UX)
allUsersModal.addEventListener("click", (e) => {
  if (e.target === allUsersModal) {
    allUsersModal.style.display = "none";
  }
});

// Initial focus and scroll on page load
window.onload = () => {
  input.focus();
  // Attempt to scroll to bottom shortly after initial render
  setTimeout(scrollToBottom, 200);
};

// Handle window resize (especially for keyboard show/hide on mobile)
// Using a debounce for performance if many resize events fire
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        scrollToBottom();
    }, 150); // Give browser time to adjust layout
});