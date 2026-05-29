import os
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
import bcrypt
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from models import db, User, Message

@app.route("/")
def home():
    return jsonify({
        "status": "success",
        "message": "Aura AI Backend Running"
    })
    
app = Flask(__name__)
CORS(app)

# Database & JWT Configuration
basedir = os.path.abspath(os.path.dirname(__file__))

# Use DATABASE_URL from env for production (Supabase/PostgreSQL)
# Fallback to local SQLite if not set
db_url = os.environ.get('DATABASE_URL')
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Add SSL mode and connection pooling for Supabase
if db_url and "supabase" in db_url.lower():
    if "?" in db_url:
        db_url += "&sslmode=require"
    else:
        db_url += "?sslmode=require"

app.config['SQLALCHEMY_DATABASE_URI'] = db_url or ('sqlite:///' + os.path.join(basedir, 'aura.db'))
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.environ.get(
    'JWT_SECRET_KEY'
)

if not app.config['JWT_SECRET_KEY']:
    raise ValueError(
        "JWT_SECRET_KEY environment variable is not set"
    )# In production, set this env var

db.init_app(app)
jwt = JWTManager(app)

# Create database tables within application context
with app.app_context():
    db.create_all()

# Use GEMINI_API_KEY from environment variables
# Use GEMINI_API_KEY from environment variables ONLY
api_key = os.environ.get("GEMINI_API_KEY")

if not api_key:
    raise ValueError(
        "GEMINI_API_KEY environment variable is not set"
    )

genai.configure(api_key=api_key)

model = genai.GenerativeModel(
    "gemini-2.5-flash",
    system_instruction="You are a helpful AI voice assistant named Aura, similar to Alexa. Always answer in short, natural, conversational sentences. Do not use markdown formatting, bullet points, or long lists. Keep answers brief and easy to listen to."
)

@app.route("/auth/signup", methods=["POST"])
def signup():
    data = request.json
    full_name = data.get("fullName")
    email = data.get("email")
    password = data.get("password")

    if not all([full_name, email, password]):
        return jsonify({"error": "Missing required fields"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 400

    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    new_user = User(full_name=full_name, email=email, password_hash=hashed_pw)
    
    db.session.add(new_user)
    db.session.commit()

    access_token = create_access_token(identity=str(new_user.id))
    return jsonify({"token": access_token, "user": {"id": new_user.id, "name": new_user.full_name}}), 201

@app.route("/auth/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    user = User.query.filter_by(email=email).first()
    
    if user and bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        access_token = create_access_token(identity=str(user.id))
        return jsonify({"token": access_token, "user": {"id": user.id, "name": user.full_name}}), 200

    return jsonify({"error": "Invalid email or password"}), 401

@app.route("/history", methods=["GET"])
@jwt_required()
def get_history():
    current_user_id = int(get_jwt_identity())
    messages = Message.query.filter_by(user_id=current_user_id).order_by(Message.timestamp.asc()).all()
    return jsonify({"messages": [msg.to_dict() for msg in messages]}), 200

@app.route("/chat", methods=["POST"])
@jwt_required(optional=True)
def chat():
    data = request.json
    user_message = data.get("message")
    current_user_id = get_jwt_identity()
    if current_user_id:
        current_user_id = int(current_user_id)
        # Save user message
        new_msg = Message(user_id=current_user_id, text=user_message, is_user=True)
        db.session.add(new_msg)
        db.session.commit()

    try:
        response = model.generate_content(user_message)
        bot_response_text = response.text
        
        if current_user_id:
            # Save bot message
            bot_msg = Message(user_id=current_user_id, text=bot_response_text, is_user=False)
            db.session.add(bot_msg)
            db.session.commit()
            
        return jsonify({
            "response": bot_response_text
        })
    except Exception as e:
        error_message = str(e)
        if "429" in error_message or "quota" in error_message.lower():
            import re
            retry_match = re.search(r'Please retry in ([\d.]+)s', error_message)
            retry_seconds = retry_match.group(1) if retry_match else None
            
            if retry_seconds:
                retry_minutes = int(float(retry_seconds) / 60)
                if retry_minutes > 0:
                    voice_msg = f"Your API token has ended. Please wait approximately {retry_minutes} minutes before trying again."
                else:
                    voice_msg = f"Your API token has ended. Please wait approximately {retry_seconds} seconds before trying again."
            else:
                voice_msg = "Your API token has ended. Please wait for the daily quota to reset or upgrade your plan."
            
            return jsonify({
                "error": "API quota exceeded.",
                "voice_message": voice_msg
            }), 429
            
        return jsonify({
            "error": f"AI API error: {error_message}",
            "voice_message": f"AI API error: {error_message}"
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)